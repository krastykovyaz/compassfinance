import { describe, expect, it } from "vitest";
import { ALL_ASSETS, ASSET_CATALOG_ORDER, assetsByCategory, getAsset, isAssetId } from "./catalog";

describe("asset catalog", () => {
  it("has exactly the 13 canonical learning/tradable assets", () => {
    expect(ASSET_CATALOG_ORDER).toHaveLength(13);
    expect(ALL_ASSETS).toHaveLength(13);
    expect(ASSET_CATALOG_ORDER).toEqual([
      "sp500",
      "nasdaq",
      "aapl",
      "nvda",
      "tsla",
      "msft",
      "amzn",
      "googl",
      "meta",
      "gold",
      "brent-oil",
      "btc",
      "eth",
    ]);
  });

  it("gives every asset a unique id, a name, a display symbol, and a Yahoo symbol", () => {
    const ids = new Set<string>();
    for (const asset of ALL_ASSETS) {
      expect(ids.has(asset.id)).toBe(false);
      ids.add(asset.id);
      expect(asset.name).toBeTruthy();
      expect(asset.symbol).toBeTruthy();
      expect(asset.yahooSymbol).toBeTruthy();
      expect(asset.slug).toBe(asset.id);
    }
  });

  it("covers all four categories required by Overview", () => {
    expect(assetsByCategory("index").length).toBeGreaterThan(0);
    expect(assetsByCategory("stock").length).toBeGreaterThan(0);
    expect(assetsByCategory("commodity").length).toBeGreaterThan(0);
    expect(assetsByCategory("crypto").length).toBeGreaterThan(0);
  });

  it("looks up a known asset by id and rejects an unknown one", () => {
    expect(getAsset("sp500")?.name).toBe("S&P 500");
    expect(getAsset("dow")).toBeUndefined();
    expect(isAssetId("btc")).toBe(true);
    expect(isAssetId("dow")).toBe(false);
  });

  it("has gold and brent-oil categorized as commodities and btc/eth as crypto", () => {
    expect(getAsset("gold")?.category).toBe("commodity");
    expect(getAsset("brent-oil")?.category).toBe("commodity");
    expect(getAsset("btc")?.category).toBe("crypto");
    expect(getAsset("eth")?.category).toBe("crypto");
  });

  it("gives every index asset a real, tradable tracking ETF — you can't literally buy an index itself, the way you can buy SPY/QQQ", () => {
    expect(getAsset("sp500")?.trackingEtfSymbol).toBe("SPY");
    expect(getAsset("nasdaq")?.trackingEtfSymbol).toBe("QQQ");
    for (const asset of ALL_ASSETS.filter((a) => a.category === "index")) {
      expect(asset.trackingEtfSymbol).toBeTruthy();
      expect(asset.trackingEtfName).toBeTruthy();
    }
  });

  it("never sets a tracking ETF for a non-index asset", () => {
    for (const asset of ALL_ASSETS.filter((a) => a.category !== "index")) {
      expect(asset.trackingEtfSymbol).toBeUndefined();
      expect(asset.trackingEtfName).toBeUndefined();
    }
  });
});
