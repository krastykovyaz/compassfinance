import { describe, expect, it } from "vitest";
import {
  getHyperliquidCoinForAsset,
  isTradableHyperliquidCoin,
  getTradeableAssetIds,
  isTradeableAssetId,
  getAssetIdForHyperliquidCoin,
} from "./asset-mapping";
import { ASSET_CATALOG_ORDER, getAsset, type AssetId } from "@/lib/assets/catalog";

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

// Phase 7: every approved tradeable asset must have a valid Hyperliquid
// mapping, and — just as importantly — the reverse must never leak an
// asset the catalog doesn't actually recognize.
describe("getTradeableAssetIds — Phase 7 trading universe", () => {
  it("every id it returns is a real CompassFinance catalog asset with a Hyperliquid coin mapping", () => {
    const ids = getTradeableAssetIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(getAsset(id)).toBeDefined();
      expect(getHyperliquidCoinForAsset(id)).not.toBeNull();
    }
  });

  it("today's known, verified tradeable universe is exactly btc and eth", () => {
    expect(new Set(getTradeableAssetIds())).toEqual(new Set(["btc", "eth"]));
  });

  it("every catalog asset without a Hyperliquid market is correctly excluded (no unmapped asset leaks in as tradeable)", () => {
    const tradeable = new Set(getTradeableAssetIds());
    const nonTradeable = ASSET_CATALOG_ORDER.filter((id) => !tradeable.has(id));
    for (const id of nonTradeable) {
      expect(getHyperliquidCoinForAsset(id)).toBeNull();
      expect(isTradeableAssetId(id)).toBe(false);
    }
    // Explicitly named in the product spec: these must stay non-tradeable.
    expect(nonTradeable).toEqual(expect.arrayContaining(["sp500", "nasdaq", "gold"]));
  });
});

describe("isTradeableAssetId — the trading-page gate", () => {
  it("is true only for mapped assets", () => {
    expect(isTradeableAssetId("btc")).toBe(true);
    expect(isTradeableAssetId("eth")).toBe(true);
  });

  it("is false for approved-but-unmapped catalog assets — these must not be able to open the trading UI", () => {
    for (const id of ["sp500", "nasdaq", "aapl", "nvda", "tsla", "msft", "amzn", "googl", "meta", "gold", "brent-oil"] satisfies AssetId[]) {
      expect(isTradeableAssetId(id)).toBe(false);
    }
  });

  it("is false for a completely unknown slug", () => {
    expect(isTradeableAssetId("doge")).toBe(false);
    expect(isTradeableAssetId("")).toBe(false);
  });
});

describe("getAssetIdForHyperliquidCoin — reverse lookup used to route/filter Markets", () => {
  it("resolves a mapped coin back to its CompassFinance asset id", () => {
    expect(getAssetIdForHyperliquidCoin("BTC")).toBe("btc");
    expect(getAssetIdForHyperliquidCoin("ETH")).toBe("eth");
  });

  it("returns null for any real Hyperliquid market that isn't an approved Compass asset — this is what keeps random Hyperliquid markets out of the Markets page", () => {
    expect(getAssetIdForHyperliquidCoin("SOL")).toBeNull();
    expect(getAssetIdForHyperliquidCoin("DOGE")).toBeNull();
    // The two documented near-miss traps: SPX is Hyperliquid's SPX6900 meme
    // coin, not the S&P 500 index; PAXG is a gold-backed token, not gold.
    expect(getAssetIdForHyperliquidCoin("SPX")).toBeNull();
    expect(getAssetIdForHyperliquidCoin("PAXG")).toBeNull();
  });
});

describe("Phase 7: human-readable display names stay separated from technical tickers", () => {
  it("S&P 500 and NASDAQ 100 retain their intended display names in the catalog", () => {
    expect(getAsset("sp500")?.name).toBe("S&P 500");
    expect(getAsset("nasdaq")?.name).toBe("Nasdaq 100");
  });

  it("Bitcoin and Ethereum resolve to human names, not their Hyperliquid coin symbols", () => {
    expect(getAsset("btc")?.name).toBe("Bitcoin");
    expect(getAsset("eth")?.name).toBe("Ethereum");
    // The catalog name must never equal the raw Hyperliquid ticker string.
    expect(getAsset("btc")?.name).not.toBe(getHyperliquidCoinForAsset("btc"));
    expect(getAsset("eth")?.name).not.toBe(getHyperliquidCoinForAsset("eth"));
  });
});
