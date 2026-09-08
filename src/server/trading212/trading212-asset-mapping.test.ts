import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mapTrading212TickerToAssetId } from "./trading212-asset-mapping";

describe("mapTrading212TickerToAssetId", () => {
  it("maps a known Trading 212 ticker (with exchange suffix) to its CompassFinance asset id", () => {
    expect(mapTrading212TickerToAssetId("AAPL_US_EQ")).toBe("aapl");
    expect(mapTrading212TickerToAssetId("NVDA_US_EQ")).toBe("nvda");
    expect(mapTrading212TickerToAssetId("TSLA_US_EQ")).toBe("tsla");
    expect(mapTrading212TickerToAssetId("MSFT_US_EQ")).toBe("msft");
    expect(mapTrading212TickerToAssetId("AMZN_US_EQ")).toBe("amzn");
    expect(mapTrading212TickerToAssetId("GOOGL_US_EQ")).toBe("googl");
  });

  it("returns null for an instrument CompassFinance's catalog doesn't cover, rather than guessing", () => {
    expect(mapTrading212TickerToAssetId("VWCE_EQ")).toBeNull();
    expect(mapTrading212TickerToAssetId("SOMETHING_RANDOM_DE_EQ")).toBeNull();
  });

  it("returns null for a bare ticker with no exchange suffix that still doesn't match", () => {
    expect(mapTrading212TickerToAssetId("XYZ")).toBeNull();
  });

  it("never matches an index/commodity/crypto catalog entry — only individual stocks are mappable from an equity ticker", () => {
    expect(mapTrading212TickerToAssetId("SPX_US_EQ")).toBeNull();
    expect(mapTrading212TickerToAssetId("BTC_US_EQ")).toBeNull();
  });
});
