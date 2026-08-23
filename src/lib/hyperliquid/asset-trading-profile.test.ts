import { describe, expect, it } from "vitest";
import { getAllAssetTradingProfiles, getAssetTradingProfile } from "./asset-trading-profile";
import { getTradeableAssetIds } from "./asset-mapping";
import { ASSET_CATALOG_ORDER } from "@/lib/assets/catalog";

describe("getAllAssetTradingProfiles — the exact trading universe by category", () => {
  const profiles = getAllAssetTradingProfiles();

  it("covers every approved catalog asset, in catalog order, and none extra", () => {
    expect(profiles.map((p) => p.assetId)).toEqual(ASSET_CATALOG_ORDER);
  });

  it("every approved asset appears — this is what Markets renders per category, so Stocks/Indices/Commodities/Crypto all show up", () => {
    const byCategory = {
      index: profiles.filter((p) => p.category === "index"),
      stock: profiles.filter((p) => p.category === "stock"),
      commodity: profiles.filter((p) => p.category === "commodity"),
      crypto: profiles.filter((p) => p.category === "crypto"),
    };
    expect(byCategory.index.length).toBeGreaterThan(0);
    expect(byCategory.stock.length).toBeGreaterThan(0);
    expect(byCategory.commodity.length).toBeGreaterThan(0);
    expect(byCategory.crypto.length).toBeGreaterThan(0);
  });

  it("every approved asset is available in Paper Trading — always true, regardless of category or Hyperliquid mapping", () => {
    for (const p of profiles) {
      expect(p.paperTradingAvailable).toBe(true);
    }
  });

  it("real trading is available for exactly the assets with a verified Hyperliquid mapping — today, btc and eth only", () => {
    const realTradeable = profiles.filter((p) => p.realTradingAvailable).map((p) => p.assetId);
    expect(new Set(realTradeable)).toEqual(new Set(getTradeableAssetIds()));
  });

  it("every real-tradeable asset has a non-null hyperliquidCoin — no asset is marked real-tradeable without a verified mapping", () => {
    for (const p of profiles) {
      if (p.realTradingAvailable) {
        expect(p.hyperliquidCoin).not.toBeNull();
      } else {
        expect(p.hyperliquidCoin).toBeNull();
      }
    }
  });

  it("technical symbols never become the primary label — name/underlying are always the human-readable catalog name, never the raw Hyperliquid coin", () => {
    for (const p of profiles) {
      expect(p.name).toBeTruthy();
      expect(p.underlying).toBeTruthy();
      if (p.hyperliquidCoin) {
        expect(p.name).not.toBe(p.hyperliquidCoin);
        expect(p.underlying).not.toBe(p.hyperliquidCoin);
      }
    }
  });

  it("S&P 500 and NASDAQ 100 keep their intended display names and are correctly non-real-tradeable", () => {
    const sp500 = profiles.find((p) => p.assetId === "sp500")!;
    const nasdaq = profiles.find((p) => p.assetId === "nasdaq")!;
    expect(sp500.name).toBe("S&P 500");
    expect(sp500.realTradingAvailable).toBe(false);
    expect(nasdaq.name).toBe("Nasdaq 100");
    expect(nasdaq.realTradingAvailable).toBe(false);
  });
});

describe("getAssetTradingProfile", () => {
  it("returns null for an unknown assetId — never fabricates a profile", () => {
    expect(getAssetTradingProfile("not-a-real-asset")).toBeNull();
  });

  it("Bitcoin: human name, crypto category, real Hyperliquid mapping, both trading modes available", () => {
    const btc = getAssetTradingProfile("btc");
    expect(btc).toEqual({
      assetId: "btc",
      name: "Bitcoin",
      category: "crypto",
      underlying: "Bitcoin",
      hyperliquidCoin: "BTC",
      paperTradingAvailable: true,
      realTradingAvailable: true,
    });
  });

  it("Apple: human name, stock category, no Hyperliquid mapping, Paper Trading only", () => {
    const aapl = getAssetTradingProfile("aapl");
    expect(aapl).toEqual({
      assetId: "aapl",
      name: "Apple Inc.",
      category: "stock",
      underlying: "Apple Inc.",
      hyperliquidCoin: null,
      paperTradingAvailable: true,
      realTradingAvailable: false,
    });
  });
});
