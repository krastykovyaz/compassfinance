import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMeta, fetchMetaAndAssetCtxs, fetchCandleSnapshot, fetchL2Book } from "./client";

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

const RAW_META = {
  universe: [
    { name: "BTC", szDecimals: 5, maxLeverage: 50 },
    { name: "ETH", szDecimals: 4, maxLeverage: 50 },
  ],
};

const RAW_ASSET_CTXS = [
  {
    dayNtlVlm: "1000000",
    funding: "0.0001",
    markPx: "60000",
    midPx: "60001",
    openInterest: "500",
    oraclePx: "60000.5",
    prevDayPx: "59000",
  },
  {
    dayNtlVlm: "500000",
    funding: "0.0002",
    markPx: "3000",
    midPx: "3000.5",
    openInterest: "200",
    oraclePx: "3000.2",
    prevDayPx: "2950",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMeta", () => {
  it("returns the normalized universe on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(RAW_META)));
    const result = await fetchMeta();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.universe).toHaveLength(2);
  });

  it("posts the exact request shape Hyperliquid's docs specify", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(RAW_META));
    vi.stubGlobal("fetch", fetchMock);
    await fetchMeta();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ type: "meta" });
  });

  it("returns malformed_response when universe is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const result = await fetchMeta();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("returns http_error on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })));
    const result = await fetchMeta();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("http_error");
  });

  it("returns rate_limited on a 429 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 429 })));
    const result = await fetchMeta();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("returns network_error when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")));
    const result = await fetchMeta();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("network_error");
  });

  it("returns malformed_response when the body isn't valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      } as unknown as Response)
    );
    const result = await fetchMeta();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });
});

describe("fetchMetaAndAssetCtxs", () => {
  it("returns [meta, assetCtxs] on a well-formed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([RAW_META, RAW_ASSET_CTXS])));
    const result = await fetchMetaAndAssetCtxs();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].universe).toHaveLength(2);
      expect(result.data[1]).toHaveLength(2);
    }
  });

  it("returns malformed_response when assetCtxs length doesn't match the universe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([RAW_META, [RAW_ASSET_CTXS[0]]])));
    const result = await fetchMetaAndAssetCtxs();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("returns malformed_response when the response isn't a 2-element array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ not: "an array" })));
    const result = await fetchMetaAndAssetCtxs();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });
});

describe("fetchCandleSnapshot", () => {
  const RAW_CANDLE = { T: 2000, t: 1000, o: "100", h: "110", l: "95", c: "105", v: "42", s: "BTC", i: "1m" };

  it("returns the raw candle series on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([RAW_CANDLE])));
    const result = await fetchCandleSnapshot("BTC", "1m", 1000, 2000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });

  it("posts the exact candleSnapshot request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([RAW_CANDLE]));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCandleSnapshot("BTC", "1m", 1000, 2000);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      type: "candleSnapshot",
      req: { coin: "BTC", interval: "1m", startTime: 1000, endTime: 2000 },
    });
  });

  it("returns malformed_response for a non-array response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const result = await fetchCandleSnapshot("BTC", "1m", 1000, 2000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("returns malformed_response when candle entries are missing required fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ t: 1000 }])));
    const result = await fetchCandleSnapshot("BTC", "1m", 1000, 2000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("returns network_error when fetch rejects (e.g. timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("The operation was aborted")));
    const result = await fetchCandleSnapshot("BTC", "1m", 1000, 2000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("network_error");
  });

  it("returns malformed_response for an empty candle series rather than an empty-but-ok result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    const result = await fetchCandleSnapshot("BTC", "1m", 1000, 2000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });
});

describe("fetchL2Book", () => {
  const RAW_BOOK = {
    coin: "BTC",
    time: 12345,
    levels: [
      [{ px: "60000", sz: "1.5", n: 3 }],
      [{ px: "60010", sz: "0.5", n: 2 }],
    ],
  };

  it("returns the raw book on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(RAW_BOOK)));
    const result = await fetchL2Book("BTC");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.levels[0]).toHaveLength(1); // bids
      expect(result.data.levels[1]).toHaveLength(1); // asks
    }
  });

  it("returns malformed_response when levels is missing or not a 2-element array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ coin: "BTC", time: 1 })));
    const result = await fetchL2Book("BTC");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });
});
