import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const checkRateLimit = vi.fn();
const getClientKey = vi.fn();
vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientKey: (...args: unknown[]) => getClientKey(...args),
}));

const compassChat = vi.fn();
vi.mock("@/server/compass/compass-engine", () => ({
  compassChat: (...args: unknown[]) => compassChat(...args),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/compass/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { message: "What are the risks in my portfolio?", context: { type: "HOME" } };

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  checkRateLimit.mockReturnValue(true);
  getClientKey.mockReturnValue("1.2.3.4");
  compassChat.mockResolvedValue({ ok: true, conversationId: "conv-1", text: "Here is your analysis.", blocks: [], suggestedFollowUps: [] });
});

describe("POST /api/compass/chat — auth (Section 41)", () => {
  it("401s a signed-out request without ever calling compassChat", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(401);
    expect(compassChat).not.toHaveBeenCalled();
  });

  it("never trusts a client-supplied userId — always resolves it from the session", async () => {
    await POST(request({ ...VALID_BODY, userId: "someone-else" }));
    expect(compassChat).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
  });
});

describe("POST /api/compass/chat — rate limiting", () => {
  it("429s when rate-limited, without ever calling compassChat", async () => {
    checkRateLimit.mockReturnValue(false);
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(429);
    expect(compassChat).not.toHaveBeenCalled();
  });

  it("namespaces the rate-limit key so it can't collide with other AI endpoints", async () => {
    await POST(request(VALID_BODY));
    expect(checkRateLimit).toHaveBeenCalledWith(expect.stringMatching(/^compass:/));
  });
});

describe("POST /api/compass/chat — input validation", () => {
  it("400s an empty message", async () => {
    const res = await POST(request({ ...VALID_BODY, message: "" }));
    expect(res.status).toBe(400);
    expect(compassChat).not.toHaveBeenCalled();
  });

  it("400s a missing message field", async () => {
    const res = await POST(request({ context: { type: "HOME" } }));
    expect(res.status).toBe(400);
  });

  it("400s an invalid/malformed context rather than passing it through", async () => {
    const res = await POST(request({ message: "Hi", context: { type: "NOT_A_REAL_TYPE" } }));
    expect(res.status).toBe(400);
    expect(compassChat).not.toHaveBeenCalled();
  });

  it("400s a context with a smuggled extra field that changes its meaning (e.g. fake ALL source injected into ASSET)", async () => {
    const res = await POST(request({ message: "Hi", context: { type: "ASSET" } })); // missing required assetId
    expect(res.status).toBe(400);
  });

  it("400s malformed JSON body", async () => {
    const res = await POST(new Request("http://localhost/api/compass/chat", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("accepts a valid conversationId and passes it through", async () => {
    await POST(request({ ...VALID_BODY, conversationId: "conv-42" }));
    expect(compassChat).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conv-42" }));
  });

  it("defaults locale to 'en' when absent or unsupported", async () => {
    await POST(request(VALID_BODY));
    expect(compassChat).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));

    compassChat.mockClear();
    await POST(request({ ...VALID_BODY, locale: "not-a-real-locale" }));
    expect(compassChat).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
  });

  it("passes through a supported locale", async () => {
    await POST(request({ ...VALID_BODY, locale: "fr" }));
    expect(compassChat).toHaveBeenCalledWith(expect.objectContaining({ locale: "fr" }));
  });
});

describe("POST /api/compass/chat — response mapping", () => {
  it("returns 200 with the structured result on success", async () => {
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, conversationId: "conv-1", text: "Here is your analysis.", blocks: [], suggestedFollowUps: [] });
  });

  it("maps conversation_not_found to 404", async () => {
    compassChat.mockResolvedValue({ ok: false, kind: "conversation_not_found" });
    const res = await POST(request({ ...VALID_BODY, conversationId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("maps a DeepSeek provider failure to 503 without leaking internal detail", async () => {
    compassChat.mockResolvedValue({ ok: false, kind: "timeout" });
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.reason).toBe("timeout");
    expect(JSON.stringify(json)).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack trace shape
  });

  it("maps invalid_response to 503", async () => {
    compassChat.mockResolvedValue({ ok: false, kind: "invalid_response" });
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(503);
  });
});
