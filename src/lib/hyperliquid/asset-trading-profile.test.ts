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

  it("real trading is available for exactly the assets with a verified Hyperliquid mapping", () => {
    const realTradeable = profiles.filter((p) => p.realTradingAvailable).map((p) => p.assetId);
    expect(new Set(realTradeable)).toEqual(new Set(getTradeableAssetIds()));
  });

  it("venue/dex is set for exactly the real-tradeable assets — native for btc/eth, hip3 for the xyz-mapped ones", () => {
    for (const p of profiles) {
      if (!p.realTradingAvailable) {
        expect(p.venue).toBeNull();
        expect(p.dex).toBeNull();
        expect(p.dexFullName).toBeNull();
        continue;
      }
      if (p.assetId === "btc" || p.assetId === "eth") {
        expect(p.venue).toBe("native");
        expect(p.dex).toBeNull();
        expect(p.dexFullName).toBeNull();
      } else {
        expect(p.venue).toBe("hip3");
        expect(p.dex).toBe("xyz");
        expect(p.dexFullName).toBe("XYZ");
      }
    }
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

  it("S&P 500 keeps its intended display name and is now real-tradeable via xyz:SP500; NASDAQ 100 stays Paper-only — no verified match", () => {
    const sp500 = profiles.find((p) => p.assetId === "sp500")!;
    const nasdaq = profiles.find((p) => p.assetId === "nasdaq")!;
    expect(sp500.name).toBe("S&P 500");
    expect(sp500.realTradingAvailable).toBe(true);
    expect(sp500.hyperliquidCoin).toBe("xyz:SP500");
    expect(nasdaq.name).toBe("Nasdaq 100");
    expect(nasdaq.realTradingAvailable).toBe(false);
    expect(nasdaq.hyperliquidCoin).toBeNull();
  });
});

describe("getAssetTradingProfile", () => {
  it("returns null for an unknown assetId — never fabricates a profile", () => {
    expect(getAssetTradingProfile("not-a-real-asset")).toBeNull();
  });

  it("Bitcoin: human name, crypto category, native Hyperliquid mapping, both trading modes available", () => {
    const btc = getAssetTradingProfile("btc");
    expect(btc).toEqual({
      assetId: "btc",
      name: "Bitcoin",
      category: "crypto",
      underlying: "Bitcoin",
      hyperliquidCoin: "BTC",
      venue: "native",
      dex: null,
      dexFullName: null,
      paperTradingAvailable: true,
      realTradingAvailable: true,
    });
  });

  it("Apple: human name, stock category, xyz HIP-3 mapping, both trading modes available", () => {
    const aapl = getAssetTradingProfile("aapl");
    expect(aapl).toEqual({
      assetId: "aapl",
      name: "Apple Inc.",
      category: "stock",
      underlying: "Apple Inc.",
      hyperliquidCoin: "xyz:AAPL",
      venue: "hip3",
      dex: "xyz",
      dexFullName: "XYZ",
      paperTradingAvailable: true,
      realTradingAvailable: true,
    });
  });

  it("Nasdaq 100: human name, index category, no verified Hyperliquid mapping, Paper Trading only", () => {
    const nasdaq = getAssetTradingProfile("nasdaq");
    expect(nasdaq).toEqual({
      assetId: "nasdaq",
      name: "Nasdaq 100",
      category: "index",
      underlying: "Nasdaq 100",
      hyperliquidCoin: null,
      venue: null,
      dex: null,
      dexFullName: null,
      paperTradingAvailable: true,
      realTradingAvailable: false,
    });
  });
});
