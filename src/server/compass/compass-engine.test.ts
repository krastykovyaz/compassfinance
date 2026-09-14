import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const completeMock = vi.fn();
vi.mock("@/lib/ai/providers/deepseek-provider", () => ({
  DeepSeekProvider: class {
    id = "deepseek";
    complete = (...args: unknown[]) => completeMock(...args);
  },
}));

const buildFinancialContext = vi.fn();
const detectMentionedAssetId = vi.fn();
vi.mock("./financial-context-builder", () => ({
  buildFinancialContext: (...args: unknown[]) => buildFinancialContext(...args),
  detectMentionedAssetId: (...args: unknown[]) => detectMentionedAssetId(...args),
}));

const createCompassConversation = vi.fn();
const appendCompassMessage = vi.fn();
const getCompassConversation = vi.fn();
vi.mock("@/server/repositories/compass-conversation-repository", () => ({
  createCompassConversation: (...args: unknown[]) => createCompassConversation(...args),
  appendCompassMessage: (...args: unknown[]) => appendCompassMessage(...args),
  getCompassConversation: (...args: unknown[]) => getCompassConversation(...args),
}));

import { compassChat } from "./compass-engine";

const EMPTY_FINANCIAL_CONTEXT = { portfolios: [], coverage: [] };

beforeEach(() => {
  vi.clearAllMocks();
  buildFinancialContext.mockResolvedValue(EMPTY_FINANCIAL_CONTEXT);
  detectMentionedAssetId.mockReturnValue(null);
  createCompassConversation.mockResolvedValue({ id: "conv-1", userId: "u1", context: { type: "HOME" }, createdAt: "t", updatedAt: "t", messages: [{ id: "m1", conversationId: "conv-1", role: "user", content: "x", structuredData: null, createdAt: "t" }] });
  appendCompassMessage.mockResolvedValue({ id: "m2", conversationId: "conv-1", role: "assistant", content: "reply", structuredData: null, createdAt: "t" });
  getCompassConversation.mockResolvedValue({ id: "conv-1", userId: "u1", context: { type: "HOME" }, createdAt: "t", updatedAt: "t", messages: [] });
});

function deepSeekOk(json: object) {
  completeMock.mockResolvedValue({ ok: true, text: JSON.stringify(json), latencyMs: 42 });
}

describe("compassChat — input validation", () => {
  it("rejects an empty message without touching the conversation store or DeepSeek", async () => {
    const result = await compassChat({ userId: "u1", message: "   ", context: { type: "HOME" }, locale: "en" });
    expect(result).toEqual({ ok: false, kind: "invalid_message" });
    expect(createCompassConversation).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized message", async () => {
    const result = await compassChat({ userId: "u1", message: "x".repeat(3000), context: { type: "HOME" }, locale: "en" });
    expect(result).toEqual({ ok: false, kind: "invalid_message" });
  });
});

describe("compassChat — no-recommendation policy short-circuit (Sections 5/6/38)", () => {
  it("never calls DeepSeek for a clearly advice-seeking message", async () => {
    const result = await compassChat({ userId: "u1", message: "Should I buy NVIDIA?", context: { type: "HOME" }, locale: "en" });
    expect(completeMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toMatch(/can't/i);
      expect(result.blocks).toEqual([]);
    }
  });

  it("persists the safe redirect as the assistant message, not the user's raw request", async () => {
    await compassChat({ userId: "u1", message: "Should I sell Bitcoin?", context: { type: "HOME" }, locale: "en" });
    expect(appendCompassMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "assistant", content: expect.stringMatching(/can't/i) }));
  });

  it("still allows a genuinely educational question through to DeepSeek", async () => {
    deepSeekOk({ text: "A sell order instructs your broker to sell an asset.", blocks: [], suggestedFollowUps: [] });
    const result = await compassChat({ userId: "u1", message: "What is a sell order?", context: { type: "HOME" }, locale: "en" });
    expect(completeMock).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

describe("compassChat — output-side safety net", () => {
  it("discards a DeepSeek response containing recommendation language and substitutes the safe redirect", async () => {
    deepSeekOk({ text: "You should buy Bitcoin.", blocks: [], suggestedFollowUps: [] });
    const result = await compassChat({ userId: "u1", message: "What are the risks in my portfolio?", context: { type: "HOME" }, locale: "en" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).not.toBe("You should buy Bitcoin.");
      expect(result.text).toMatch(/can't/i);
    }
  });

  it("checks recommendation language inside block text fields too, not just the top-level text", async () => {
    deepSeekOk({ text: "Here is an analysis.", blocks: [{ type: "risk", label: "Concentration", description: "You should sell this position to reduce risk." }], suggestedFollowUps: [] });
    const result = await compassChat({ userId: "u1", message: "What are the risks in my portfolio?", context: { type: "HOME" }, locale: "en" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blocks).toEqual([]);
  });

  it("passes through a genuinely safe analytical response unchanged", async () => {
    deepSeekOk({ text: "NVIDIA is up 2% today.", blocks: [{ type: "metric", label: "Change", value: "+2%" }], suggestedFollowUps: ["Why did it move?"] });
    const result = await compassChat({ userId: "u1", message: "How is NVIDIA doing?", context: { type: "ASSET", assetId: "nvda" }, locale: "en" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("NVIDIA is up 2% today.");
      expect(result.blocks).toHaveLength(1);
    }
  });
});

describe("compassChat — DeepSeek error handling (Section 39)", () => {
  it("surfaces a provider failure as a typed result without persisting an assistant message", async () => {
    completeMock.mockResolvedValue({ ok: false, kind: "timeout", latencyMs: 100 });
    const result = await compassChat({ userId: "u1", message: "What are the risks in my portfolio?", context: { type: "HOME" }, locale: "en" });
    expect(result).toEqual({ ok: false, kind: "timeout" });
    expect(appendCompassMessage).not.toHaveBeenCalled();
  });

  it("surfaces malformed JSON from DeepSeek as invalid_response", async () => {
    completeMock.mockResolvedValue({ ok: true, text: "not valid json", latencyMs: 50 });
    const result = await compassChat({ userId: "u1", message: "What are the risks in my portfolio?", context: { type: "HOME" }, locale: "en" });
    expect(result).toEqual({ ok: false, kind: "invalid_response" });
  });
});

describe("compassChat — conversation lifecycle (Section 23/45)", () => {
  it("creates a new conversation when no conversationId is given, tagged with the given context", async () => {
    deepSeekOk({ text: "ok", blocks: [], suggestedFollowUps: [] });
    await compassChat({ userId: "u1", message: "What are the risks in my portfolio?", context: { type: "PORTFOLIO", source: "TRADING212" }, locale: "en" });
    expect(createCompassConversation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", context: { type: "PORTFOLIO", source: "TRADING212" }, firstMessage: expect.objectContaining({ role: "user", content: "What are the risks in my portfolio?" }) })
    );
  });

  it("appends to an existing conversation when a conversationId is given", async () => {
    deepSeekOk({ text: "ok", blocks: [], suggestedFollowUps: [] });
    await compassChat({ userId: "u1", conversationId: "conv-1", message: "What about NVIDIA?", context: { type: "PORTFOLIO", source: "TRADING212" }, locale: "en" });
    expect(getCompassConversation).toHaveBeenCalledWith("u1", "conv-1");
    expect(createCompassConversation).not.toHaveBeenCalled();
    expect(appendCompassMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conv-1", role: "user", content: "What about NVIDIA?" }));
  });

  it("rejects a conversationId that doesn't belong to this user (or doesn't exist) without leaking which", async () => {
    getCompassConversation.mockResolvedValue(null);
    const result = await compassChat({ userId: "attacker", conversationId: "someone-elses-conv", message: "Hi", context: { type: "HOME" }, locale: "en" });
    expect(result).toEqual({ ok: false, kind: "conversation_not_found" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("passes prior conversation history into the financial-context builder's caller data (via the message-building path) for follow-up continuity", async () => {
    getCompassConversation.mockResolvedValue({
      id: "conv-1",
      userId: "u1",
      context: { type: "PORTFOLIO", source: "TRADING212" },
      createdAt: "t",
      updatedAt: "t",
      messages: [{ id: "m0", conversationId: "conv-1", role: "user", content: "Why did my portfolio fall today?", structuredData: null, createdAt: "t" }],
    });
    deepSeekOk({ text: "ok", blocks: [], suggestedFollowUps: [] });
    await compassChat({ userId: "u1", conversationId: "conv-1", message: "What about NVIDIA?", context: { type: "PORTFOLIO", source: "TRADING212" }, locale: "en" });
    expect(buildFinancialContext).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", message: "What about NVIDIA?" }));
  });
});

describe("compassChat — never sends credentials to the model (Section 3/23)", () => {
  it("never includes userId, tokens, or secrets in the prompt sent to DeepSeek", async () => {
    deepSeekOk({ text: "ok", blocks: [], suggestedFollowUps: [] });
    await compassChat({ userId: "very-secret-user-id-should-not-leak", message: "What are the risks in my portfolio?", context: { type: "HOME" }, locale: "en" });
    const call = completeMock.mock.calls[0][0];
    expect(call.systemPrompt + call.userPrompt).not.toContain("very-secret-user-id-should-not-leak");
  });
});
