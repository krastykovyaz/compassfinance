import { describe, expect, it } from "vitest";
import { CHART_RANGES } from "@/server/market/range-mapping";
import { mapRangeToHyperliquidParams } from "./range-mapping";

describe("mapRangeToHyperliquidParams", () => {
  it("maps every range except 5Y to a distinct, real interval", () => {
    const supported = CHART_RANGES.filter((r) => r !== "5Y");
    for (const range of supported) {
      const params = mapRangeToHyperliquidParams(range);
      expect(params).not.toBeNull();
      expect(typeof params?.interval).toBe("string");
      expect(params?.lookbackMs).toBeGreaterThan(0);
      expect(params?.cacheTtlMs).toBeGreaterThan(0);
    }
  });

  it("returns null for 5Y — explicitly unsupported rather than a guessed interval", () => {
    expect(mapRangeToHyperliquidParams("5Y")).toBeNull();
  });

  it("uses shorter intervals for shorter ranges", () => {
    const oneDay = mapRangeToHyperliquidParams("1D");
    const oneYear = mapRangeToHyperliquidParams("1Y");
    expect(oneDay?.lookbackMs).toBeLessThan(oneYear!.lookbackMs);
    expect(oneDay?.cacheTtlMs).toBeLessThan(oneYear!.cacheTtlMs);
  });
});
