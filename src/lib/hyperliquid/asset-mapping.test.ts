import { describe, expect, it } from "vitest";
import {
  getHyperliquidCoinForAsset,
  isTradableHyperliquidCoin,
  getTradeableAssetIds,
  isTradeableAssetId,
  getAssetIdForHyperliquidCoin,
  isHip3Coin,
  getHip3DexName,
  getHip3DexFullName,
  getConfiguredHip3DexNames,
} from "./asset-mapping";
import { ASSET_CATALOG_ORDER, getAsset, type AssetId } from "@/lib/assets/catalog";

// Phase 8's verified real-tradeable universe: btc/eth on the native dex,
// plus 10 more on the "xyz" HIP-3 dex (the only builder-deployed dex with
// any real liquidity among the several candidates investigated). nasdaq
// is the sole catalog asset still deliberately unmapped — no dex has a
// genuine, liquid NASDAQ/NDX match.
const XYZ_MAPPED: Record<string, string> = {
  sp500: "xyz:SP500",
  aapl: "xyz:AAPL",
  nvda: "xyz:NVDA",
  tsla: "xyz:TSLA",
  msft: "xyz:MSFT",
  amzn: "xyz:AMZN",
  googl: "xyz:GOOGL",
  meta: "xyz:META",
  gold: "xyz:GOLD",
  "brent-oil": "xyz:BRENTOIL",
};

describe("getHyperliquidCoinForAsset", () => {
  it("maps btc/eth to their native Hyperliquid coin symbols", () => {
    expect(getHyperliquidCoinForAsset("btc")).toBe("BTC");
    expect(getHyperliquidCoinForAsset("eth")).toBe("ETH");
  });

  it("maps every Phase 8 xyz asset to its exact verified xyz:* market", () => {
    for (const [assetId, coin] of Object.entries(XYZ_MAPPED)) {
      expect(getHyperliquidCoinForAsset(assetId)).toBe(coin);
    }
  });

  it("returns null for nasdaq — the one catalog asset with no verified match", () => {
    expect(getHyperliquidCoinForAsset("nasdaq")).toBeNull();
  });

  it("returns null for an unknown asset id", () => {
    expect(getHyperliquidCoinForAsset("not-a-real-asset")).toBeNull();
  });
});

describe("isTradableHyperliquidCoin — the order-submission allowlist", () => {
  it("is true for BTC, ETH, and every mapped xyz:* market", () => {
    expect(isTradableHyperliquidCoin("BTC")).toBe(true);
    expect(isTradableHyperliquidCoin("ETH")).toBe(true);
    for (const coin of Object.values(XYZ_MAPPED)) {
      expect(isTradableHyperliquidCoin(coin)).toBe(true);
    }
  });

  it("is false for any other coin, even a real Hyperliquid market", () => {
    expect(isTradableHyperliquidCoin("SOL")).toBe(false);
    expect(isTradableHyperliquidCoin("DOGE")).toBe(false);
  });

  it("is false for a near-miss xyz market this app never approved", () => {
    // xyz:XYZ100 exists but isn't verifiably Nasdaq-100 — never approved.
    expect(isTradableHyperliquidCoin("xyz:XYZ100")).toBe(false);
  });

  it("is false for a lowercase or malformed value", () => {
    expect(isTradableHyperliquidCoin("btc")).toBe(false);
    expect(isTradableHyperliquidCoin("")).toBe(false);
  });
});

describe("getTradeableAssetIds — the real-trading universe", () => {
  it("every id it returns is a real CompassFinance catalog asset with a Hyperliquid coin mapping", () => {
    const ids = getTradeableAssetIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(getAsset(id)).toBeDefined();
      expect(getHyperliquidCoinForAsset(id)).not.toBeNull();
    }
  });

  it("today's verified tradeable universe is exactly btc/eth plus the 10 xyz-mapped assets", () => {
    expect(new Set(getTradeableAssetIds())).toEqual(new Set(["btc", "eth", ...Object.keys(XYZ_MAPPED)]));
  });

  it("nasdaq is the only catalog asset excluded — no unmapped asset leaks in as tradeable", () => {
    const tradeable = new Set(getTradeableAssetIds());
    const nonTradeable = ASSET_CATALOG_ORDER.filter((id) => !tradeable.has(id));
    expect(nonTradeable).toEqual(["nasdaq"]);
    expect(getHyperliquidCoinForAsset("nasdaq")).toBeNull();
    expect(isTradeableAssetId("nasdaq")).toBe(false);
  });
});

describe("isTradeableAssetId — the trading-page gate", () => {
  it("is true for btc/eth and every xyz-mapped asset", () => {
    expect(isTradeableAssetId("btc")).toBe(true);
    expect(isTradeableAssetId("eth")).toBe(true);
    for (const id of Object.keys(XYZ_MAPPED)) {
      expect(isTradeableAssetId(id as AssetId)).toBe(true);
    }
  });

  it("is false for nasdaq — must not be able to open the real-trading UI", () => {
    expect(isTradeableAssetId("nasdaq")).toBe(false);
  });

  it("is false for a completely unknown slug", () => {
    expect(isTradeableAssetId("doge")).toBe(false);
    expect(isTradeableAssetId("")).toBe(false);
  });
});

describe("getAssetIdForHyperliquidCoin — reverse lookup used to route/filter Markets", () => {
  it("resolves every mapped coin back to its CompassFinance asset id", () => {
    expect(getAssetIdForHyperliquidCoin("BTC")).toBe("btc");
    expect(getAssetIdForHyperliquidCoin("ETH")).toBe("eth");
    for (const [assetId, coin] of Object.entries(XYZ_MAPPED)) {
      expect(getAssetIdForHyperliquidCoin(coin)).toBe(assetId);
    }
  });

  it("returns null for any real Hyperliquid market that isn't an approved Compass asset — this is what keeps random Hyperliquid markets out of the Markets page", () => {
    expect(getAssetIdForHyperliquidCoin("SOL")).toBeNull();
    expect(getAssetIdForHyperliquidCoin("DOGE")).toBeNull();
    // The two documented native-dex near-miss traps: SPX is Hyperliquid's
    // SPX6900 meme coin, not the S&P 500 index; PAXG is a gold-backed
    // token, not gold.
    expect(getAssetIdForHyperliquidCoin("SPX")).toBeNull();
    expect(getAssetIdForHyperliquidCoin("PAXG")).toBeNull();
    // xyz's own branded "100" basket — not verifiably Nasdaq-100.
    expect(getAssetIdForHyperliquidCoin("xyz:XYZ100")).toBeNull();
    // Other real xyz markets this app never approved for trading.
    expect(getAssetIdForHyperliquidCoin("xyz:COIN")).toBeNull();
  });
});

describe("HIP-3 coin/dex helpers", () => {
  it("isHip3Coin distinguishes a dex-qualified coin from a native one", () => {
    expect(isHip3Coin("xyz:AAPL")).toBe(true);
    expect(isHip3Coin("BTC")).toBe(false);
  });

  it("getHip3DexName extracts the dex short name, or null for native", () => {
    expect(getHip3DexName("xyz:AAPL")).toBe("xyz");
    expect(getHip3DexName("xyz:SP500")).toBe("xyz");
    expect(getHip3DexName("BTC")).toBeNull();
  });

  it("getHip3DexFullName resolves the dex's display name, null for unknown", () => {
    expect(getHip3DexFullName("xyz")).toBe("XYZ");
    expect(getHip3DexFullName("not-a-real-dex")).toBeNull();
  });

  it("getConfiguredHip3DexNames returns exactly the dexes this app actually maps assets to", () => {
    expect(getConfiguredHip3DexNames()).toEqual(["xyz"]);
  });
});

describe("Phase 8: human-readable display names stay separated from technical tickers", () => {
  it("S&P 500 and NASDAQ 100 retain their intended display names in the catalog", () => {
    expect(getAsset("sp500")?.name).toBe("S&P 500");
    expect(getAsset("nasdaq")?.name).toBe("Nasdaq 100");
  });

  it("Bitcoin and Ethereum resolve to human names, not their Hyperliquid coin symbols", () => {
    expect(getAsset("btc")?.name).toBe("Bitcoin");
    expect(getAsset("eth")?.name).toBe("Ethereum");
    expect(getAsset("btc")?.name).not.toBe(getHyperliquidCoinForAsset("btc"));
    expect(getAsset("eth")?.name).not.toBe(getHyperliquidCoinForAsset("eth"));
  });

  it("every xyz-mapped asset's catalog name is never its technical xyz:* ticker", () => {
    for (const [assetId, coin] of Object.entries(XYZ_MAPPED)) {
      const name = getAsset(assetId)?.name;
      expect(name).toBeTruthy();
      expect(name).not.toBe(coin);
      expect(name?.startsWith("xyz")).toBe(false);
    }
  });
});
