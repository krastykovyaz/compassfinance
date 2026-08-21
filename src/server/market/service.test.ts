import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchYahooQuote = vi.fn();
const fetchYahooCandles = vi.fn();

vi.mock("./yahoo-client", () => ({
  fetchYahooQuote: (...args: unknown[]) => fetchYahooQuote(...args),
  fetchYahooCandles: (...args: unknown[]) => fetchYahooCandles(...args),
}));

import { clearMarketCache } from "./cache";
import { getCandles, getQuote, getQuotes } from "./service";

beforeEach(() => {
  vi.clearAllMocks();
  clearMarketCache();
});

describe("getQuote", () => {
  it("returns an ok quote with change/changePercent derived from the fetched price", async () => {
    fetchYahooQuote.mockResolvedValue({ ok: true, data: { price: 550, previousClose: 500 } });

    const result = await getQuote("sp500");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.quote.slug).toBe("sp500");
      expect(result.quote.symbol).toBe("SPX");
      expect(result.quote.price).toBe(550);
      expect(result.quote.change).toBe(50);
      expect(result.quote.changePercent).toBeCloseTo(10, 5);
    }
    expect(fetchYahooQuote).toHaveBeenCalledWith("^GSPC"); // sp500 -> real Yahoo index symbol, no ETF proxy
  });

  it("returns unavailable (not fake data) when Yahoo can't answer", async () => {
    fetchYahooQuote.mockResolvedValue({ ok: false, reason: "not_found", message: "No data found" });

    const result = await getQuote("aapl");

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("No data found");
    }
  });

  it("returns unavailable for an unsupported instrument without calling Yahoo", async () => {
    const result = await getQuote("doge");

    expect(result.status).toBe("unavailable");
    expect(fetchYahooQuote).not.toHaveBeenCalled();
  });

  it("returns unavailable when the upstream client throws", async () => {
    fetchYahooQuote.mockRejectedValue(new Error("boom"));

    const result = await getQuote("nvda");

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("boom");
    }
  });

  it("caches repeated calls for the same symbol within the TTL (rate protection)", async () => {
    fetchYahooQuote.mockResolvedValue({ ok: true, data: { price: 100, previousClose: 100 } });

    await getQuote("msft");
    await getQuote("msft");
    await getQuote("msft");

    expect(fetchYahooQuote).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed fetch, so a transient error can recover on the next call", async () => {
    fetchYahooQuote.mockRejectedValueOnce(new Error("transient"));
    fetchYahooQuote.mockResolvedValueOnce({ ok: true, data: { price: 10, previousClose: 9 } });

    const first = await getQuote("tsla");
    const second = await getQuote("tsla");

    expect(first.status).toBe("unavailable");
    expect(second.status).toBe("ok");
    expect(fetchYahooQuote).toHaveBeenCalledTimes(2);
  });
});

describe("getQuotes", () => {
  it("fetches every requested symbol and preserves per-symbol failures", async () => {
    fetchYahooQuote.mockImplementation(async (ticker: string) =>
      ticker === "^GSPC"
        ? { ok: true, data: { price: 500, previousClose: 490 } }
        : { ok: false, reason: "not_found", message: "nope" }
    );

    const results = await getQuotes(["sp500", "aapl"]);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.slug === "sp500")?.status).toBe("ok");
    expect(results.find((r) => r.slug === "aapl")?.status).toBe("unavailable");
  });
});

describe("getCandles", () => {
  it("normalizes candles and maps range to the correct Yahoo interval", async () => {
    fetchYahooCandles.mockResolvedValue({
      ok: true,
      data: [{ t: 1000, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }],
    });

    const result = await getCandles("aapl", "1M");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.candles).toHaveLength(1);
    }
    expect(fetchYahooCandles).toHaveBeenCalledWith("AAPL", { range: "1mo", interval: "1d" });
  });

  it("maps every supported chart range to a distinct Yahoo range/interval pair", async () => {
    fetchYahooCandles.mockResolvedValue({ ok: true, data: [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: null }] });

    const expected: Record<string, { range: string; interval: string }> = {
      "1D": { range: "1d", interval: "5m" },
      "1W": { range: "5d", interval: "15m" },
      "1M": { range: "1mo", interval: "1d" },
      "3M": { range: "3mo", interval: "1d" },
      "1Y": { range: "1y", interval: "1wk" },
      "5Y": { range: "5y", interval: "1mo" },
    };

    for (const [range, params] of Object.entries(expected)) {
      await getCandles("sp500", range);
      expect(fetchYahooCandles).toHaveBeenLastCalledWith("^GSPC", params);
    }
  });

  it("returns unavailable for an unsupported range", async () => {
    const result = await getCandles("sp500", "10Y");

    expect(result.status).toBe("unavailable");
    expect(fetchYahooCandles).not.toHaveBeenCalled();
  });

  it("returns unavailable for an unsupported instrument", async () => {
    const result = await getCandles("doge", "1D");

    expect(result.status).toBe("unavailable");
    expect(fetchYahooCandles).not.toHaveBeenCalled();
  });

  it("returns unavailable (not fake candles) on a malformed upstream response", async () => {
    fetchYahooCandles.mockResolvedValue({
      ok: false,
      reason: "malformed_response",
      message: "No usable candles",
    });

    const result = await getCandles("nvda", "1D");

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("No usable candles");
    }
  });
});
