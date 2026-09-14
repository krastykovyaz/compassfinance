import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mapInteractiveBrokersPositionToAssetId } from "./interactive-brokers-asset-mapping";

describe("mapInteractiveBrokersPositionToAssetId", () => {
  it("maps a known stock symbol to its CompassFinance asset id when assetClass is STK", () => {
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "265598", symbol: "AAPL", assetClass: "STK", currency: "USD" })).toBe(
      "aapl"
    );
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "76792991", symbol: "TSLA", assetClass: "STK", currency: "USD" })).toBe(
      "tsla"
    );
  });

  it("returns null for a symbol CompassFinance's catalog doesn't cover, rather than guessing", () => {
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "1", symbol: "RANDOMCO", assetClass: "STK", currency: "USD" })).toBeNull();
  });

  it("SECURITY: never maps a non-stock instrument to a stock's Compass asset, even when the symbol matches exactly", () => {
    // The exact collision the priority ordering exists to prevent: an
    // AAPL option/future sharing AAPL's own root symbol must never
    // resolve to the AAPL stock's Compass asset id.
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "1", symbol: "AAPL", assetClass: "OPT", currency: "USD" })).toBeNull();
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "2", symbol: "AAPL", assetClass: "FUT", currency: "USD" })).toBeNull();
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "3", symbol: "AAPL", assetClass: "CASH", currency: "USD" })).toBeNull();
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "4", symbol: "AAPL", assetClass: null, currency: "USD" })).toBeNull();
  });

  it("returns null when there is no symbol at all", () => {
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "1", symbol: null, assetClass: "STK", currency: "USD" })).toBeNull();
  });

  it("never matches an index/commodity/crypto catalog entry — only individual stocks are mappable from an IBKR STK position", () => {
    expect(mapInteractiveBrokersPositionToAssetId({ conid: "1", symbol: "SPX", assetClass: "STK", currency: "USD" })).toBeNull();
  });
});
