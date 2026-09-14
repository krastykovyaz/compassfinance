import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeepSeekProvider } from "./deepseek-provider";

// DeepSeekProvider has no prior dedicated test file — every caller
// exercised it only indirectly through its own mocks. This file covers
// the `disableReasoning` request-body wiring specifically: a real,
// production-observed bug (see compass-engine.ts's own comment) where
// DeepSeek's reasoning pass silently consumed an entire 700-token budget
// before producing any visible content, leaving Compass Agent with an
// empty, unparseable response on every request. `disableReasoning` is
// the fix; this test guards the actual request shape that fix depends on.
//
// Uses vi.stubGlobal/unstubAllGlobals (not a raw `global.fetch =`
// assignment) specifically so a mid-test throw can never leave a stubbed
// fetch leaking into an unrelated test file sharing the same worker.

const originalApiKey = process.env.DEEPSEEK_API_KEY;

function mockFetchOk(content: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.DEEPSEEK_API_KEY = originalApiKey;
});

describe("DeepSeekProvider — disableReasoning", () => {
  it("sends thinking: { type: 'disabled' } when disableReasoning is true", async () => {
    const fetchMock = mockFetchOk('{"text":"ok"}');
    const provider = new DeepSeekProvider();

    await provider.complete({ systemPrompt: "sys", userPrompt: "usr", expectJson: true, disableReasoning: true });

    expect(requestBody(fetchMock).thinking).toEqual({ type: "disabled" });
  });

  it("omits the thinking field entirely when disableReasoning is not set (preserves default behavior for existing callers like the AI Tutor)", async () => {
    const fetchMock = mockFetchOk('{"text":"ok"}');
    const provider = new DeepSeekProvider();

    await provider.complete({ systemPrompt: "sys", userPrompt: "usr", expectJson: true });

    expect(requestBody(fetchMock)).not.toHaveProperty("thinking");
  });

  it("omits the thinking field when disableReasoning is explicitly false", async () => {
    const fetchMock = mockFetchOk('{"text":"ok"}');
    const provider = new DeepSeekProvider();

    await provider.complete({ systemPrompt: "sys", userPrompt: "usr", expectJson: true, disableReasoning: false });

    expect(requestBody(fetchMock)).not.toHaveProperty("thinking");
  });

  it("still sends response_format for JSON mode alongside disableReasoning — the two are independent", async () => {
    const fetchMock = mockFetchOk('{"text":"ok"}');
    const provider = new DeepSeekProvider();

    await provider.complete({ systemPrompt: "sys", userPrompt: "usr", expectJson: true, disableReasoning: true });

    const body = requestBody(fetchMock);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.thinking).toEqual({ type: "disabled" });
  });
});
