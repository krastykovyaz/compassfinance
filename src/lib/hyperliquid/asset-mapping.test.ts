import { describe, expect, it } from "vitest";
import { getHyperliquidCoinForAsset, isTradableHyperliquidCoin } from "./asset-mapping";

describe("getHyperliquidCoinForAsset", () => {
  it("maps btc/eth to their Hyperliquid coin symbols", () => {
    expect(getHyperliquidCoinForAsset("btc")).toBe("BTC");
    expect(getHyperliquidCoinForAsset("eth")).toBe("ETH");
  });

  it("returns null for a catalog asset with no Hyperliquid market", () => {
    expect(getHyperliquidCoinForAsset("sp500")).toBeNull();
    expect(getHyperliquidCoinForAsset("aapl")).toBeNull();
  });

  it("returns null for an unknown asset id", () => {
    expect(getHyperliquidCoinForAsset("not-a-real-asset")).toBeNull();
  });
});

describe("isTradableHyperliquidCoin — the Phase 4 order-submission allowlist", () => {
  it("is true for BTC and ETH", () => {
    expect(isTradableHyperliquidCoin("BTC")).toBe(true);
    expect(isTradableHyperliquidCoin("ETH")).toBe(true);
  });

  it("is false for any other coin, even a real Hyperliquid market", () => {
    expect(isTradableHyperliquidCoin("SOL")).toBe(false);
    expect(isTradableHyperliquidCoin("DOGE")).toBe(false);
  });

  it("is false for a lowercase or malformed value", () => {
    expect(isTradableHyperliquidCoin("btc")).toBe(false);
    expect(isTradableHyperliquidCoin("")).toBe(false);
  });
});
