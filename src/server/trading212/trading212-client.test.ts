import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchTrading212AccountInfo, getTrading212BaseUrl } from "./trading212-client";

function jsonResponse(body: unknown, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTrading212BaseUrl", () => {
  const original = { ...process.env };
  afterEach(() => {
    // Assigning `undefined` to a process.env key stores the literal
    // string "undefined" instead of deleting it (a real Node.js
    // process.env gotcha) — delete outright when there was nothing to
    // restore, or this leaks a truthy "undefined" into later tests.
    if (original.TRADING212_ENVIRONMENT === undefined) delete process.env.TRADING212_ENVIRONMENT;
    else process.env.TRADING212_ENVIRONMENT = original.TRADING212_ENVIRONMENT;
    if (original.TRADING212_API_BASE_URL === undefined) delete process.env.TRADING212_API_BASE_URL;
    else process.env.TRADING212_API_BASE_URL = original.TRADING212_API_BASE_URL;
  });

  it("defaults to the real live environment, never silently defaulting to demo", () => {
    delete process.env.TRADING212_ENVIRONMENT;
    delete process.env.TRADING212_API_BASE_URL;
    expect(getTrading212BaseUrl()).toBe("https://live.trading212.com/api/v0");
  });

  it("uses the demo environment only when explicitly configured", () => {
    process.env.TRADING212_ENVIRONMENT = "demo";
    delete process.env.TRADING212_API_BASE_URL;
    expect(getTrading212BaseUrl()).toBe("https://demo.trading212.com/api/v0");
  });

  it("an explicit base URL override always wins", () => {
    process.env.TRADING212_API_BASE_URL = "https://custom.example.com/api/v0";
    expect(getTrading212BaseUrl()).toBe("https://custom.example.com/api/v0");
  });
});

describe("fetchTrading212AccountInfo", () => {
  it("sends real HTTP Basic auth (API Key as username, API Secret as password) to the account-info endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 12345678, currencyCode: "USD" }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTrading212AccountInfo("my-key", "my-secret");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://live.trading212.com/api/v0/equity/account/info");
    const expectedAuth = `Basic ${Buffer.from("my-key:my-secret").toString("base64")}`;
    expect((init.headers as Record<string, string>).Authorization).toBe(expectedAuth);
  });

  it("returns the account id (stringified) and currency on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: 12345678, currencyCode: "USD" })));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result).toEqual({ ok: true, data: { id: "12345678", currencyCode: "USD" } });
  });

  it("classifies a 401 as unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "unauthorized" }, { status: 401 })));

    const result = await fetchTrading212AccountInfo("bad-key", "bad-secret");

    expect(result).toEqual({ ok: false, reason: "unauthorized", message: expect.any(String) });
  });

  it("classifies a 403 as unauthorized too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 403 })));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unauthorized");
  });

  it("classifies a 429 as rate_limited, distinct from unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 429 })));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("classifies a network failure as network_error, never throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result).toEqual({ ok: false, reason: "network_error", message: expect.any(String) });
  });

  it("classifies a response missing an account id as malformed, never fabricating one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ currencyCode: "USD" })));

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result).toEqual({ ok: false, reason: "malformed_response", message: expect.any(String) });
  });

  it("classifies unparseable JSON as malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response)
    );

    const result = await fetchTrading212AccountInfo("key", "secret");

    expect(result).toEqual({ ok: false, reason: "malformed_response", message: expect.any(String) });
  });

  it("never logs the API key, API secret, or Authorization header for any outcome", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await fetchTrading212AccountInfo("super-secret-key-123", "super-secret-value-456");

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((arg) => JSON.stringify(arg))
      .join(" ");
    expect(allLoggedText).not.toContain("super-secret-key-123");
    expect(allLoggedText).not.toContain("super-secret-value-456");
    expect(allLoggedText).not.toContain("Basic ");

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
