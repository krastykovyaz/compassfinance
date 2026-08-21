import { describe, expect, it } from "vitest";
import { CHART_RANGES, isChartRange, mapRangeToYahooParams } from "./range-mapping";

describe("isChartRange", () => {
  it("accepts every supported range", () => {
    for (const r of CHART_RANGES) {
      expect(isChartRange(r)).toBe(true);
    }
  });

  it("rejects an unsupported range", () => {
    expect(isChartRange("10Y")).toBe(false);
    expect(isChartRange("")).toBe(false);
  });
});

describe("mapRangeToYahooParams", () => {
  it("gives every range a distinct Yahoo range/interval pair and a positive cache TTL", () => {
    const seen = new Set<string>();
    for (const r of CHART_RANGES) {
      const params = mapRangeToYahooParams(r);
      const key = `${params.range}:${params.interval}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(params.cacheTtlMs).toBeGreaterThan(0);
    }
  });

  it("uses intraday intervals only for the short ranges", () => {
    expect(mapRangeToYahooParams("1D").interval).toBe("5m");
    expect(mapRangeToYahooParams("1W").interval).toBe("15m");
  });

  it("steps up to daily/weekly/monthly candles for longer ranges", () => {
    expect(mapRangeToYahooParams("1M").interval).toBe("1d");
    expect(mapRangeToYahooParams("3M").interval).toBe("1d");
    expect(mapRangeToYahooParams("1Y").interval).toBe("1wk");
    expect(mapRangeToYahooParams("5Y").interval).toBe("1mo");
  });
});
