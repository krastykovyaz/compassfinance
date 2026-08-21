import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchYahooCandles, fetchYahooQuote } from "./yahoo-client";

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchYahooQuote", () => {
  it("URL-encodes special-character Yahoo symbols (index caret, futures equals sign)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        chart: { result: [{ meta: { regularMarketPrice: 100, chartPreviousClose: 99 } }] },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchYahooQuote("^GSPC");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("%5EGSPC"),
      expect.anything()
    );

    await fetchYahooQuote("GC=F");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("GC%3DF"),
      expect.anything()
    );

    await fetchYahooQuote("BTC-USD");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("BTC-USD"),
      expect.anything()
    );
  });

  it("returns a normalized quote for a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 512.34,
                  chartPreviousClose: 500.0,
                },
              },
            ],
          },
        })
      )
    );

    const result = await fetchYahooQuote("SPY");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(512.34);
      expect(result.data.previousClose).toBe(500.0);
    }
  });

  it("returns not_found when Yahoo reports a symbol error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          chart: {
            result: null,
            error: { code: "Not Found", description: "No data found, symbol may be delisted" },
          },
        })
      )
    );

    const result = await fetchYahooQuote("NOTATICKER");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
    }
  });

  it("returns malformed_response when the payload has no chart result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const result = await fetchYahooQuote("SPY");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed_response");
    }
  });

  it("returns malformed_response when price fields are missing or non-numeric", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          chart: { result: [{ meta: { regularMarketPrice: "not-a-number" } }] },
        })
      )
    );

    const result = await fetchYahooQuote("SPY");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed_response");
    }
  });

  it("returns http_error on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }))
    );

    const result = await fetchYahooQuote("SPY");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("http_error");
    }
  });

  it("returns not_found on a 404 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }))
    );

    const result = await fetchYahooQuote("SPY");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
    }
  });

  it("returns network_error when fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"))
    );

    const result = await fetchYahooQuote("SPY");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("network_error");
    }
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

    const result = await fetchYahooQuote("SPY");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed_response");
    }
  });
});

describe("fetchYahooCandles", () => {
  it("normalizes a valid OHLC series", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          chart: {
            result: [
              {
                timestamp: [1_700_000_000, 1_700_003_600],
                indicators: {
                  quote: [
                    {
                      open: [100, 101],
                      high: [102, 103],
                      low: [99, 100],
                      close: [101, 102],
                      volume: [1000, 1200],
                    },
                  ],
                },
              },
            ],
          },
        })
      )
    );

    const result = await fetchYahooCandles("AAPL", { range: "1d", interval: "5m" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        t: 1_700_000_000 * 1000,
        o: 100,
        h: 102,
        l: 99,
        c: 101,
        v: 1000,
      });
    }
  });

  it("skips null OHLC points instead of fabricating values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          chart: {
            result: [
              {
                timestamp: [1, 2, 3],
                indicators: {
                  quote: [
                    {
                      open: [100, null, 102],
                      high: [101, null, 103],
                      low: [99, null, 101],
                      close: [100.5, null, 102.5],
                      volume: [10, null, 12],
                    },
                  ],
                },
              },
            ],
          },
        })
      )
    );

    const result = await fetchYahooCandles("AAPL", { range: "1d", interval: "5m" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
    }
  });

  it("returns malformed_response when the timestamp/quote arrays are missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ chart: { result: [{}] } }))
    );

    const result = await fetchYahooCandles("AAPL", { range: "1d", interval: "5m" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed_response");
    }
  });

  it("returns malformed_response when every candle in the series is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          chart: {
            result: [
              {
                timestamp: [1],
                indicators: { quote: [{ open: [null], high: [null], low: [null], close: [null] }] },
              },
            ],
          },
        })
      )
    );

    const result = await fetchYahooCandles("AAPL", { range: "1d", interval: "5m" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed_response");
    }
  });
});
