import { describe, expect, it } from "vitest";
import {
  normalizeTrading212Position,
  normalizePaperHolding,
  normalizeHyperliquidPosition,
} from "./portfolio-sources";
import type { Trading212PositionDTO } from "@/server/repositories/trading212-portfolio-repository";
import type { PaperPositionView } from "@/lib/trading/types";
import type { HyperliquidPosition } from "@/lib/hyperliquid/hyperliquid-types";

function trading212Position(overrides: Partial<Trading212PositionDTO> = {}): Trading212PositionDTO {
  return {
    compassAssetId: null,
    externalTicker: "AAPL_US_EQ",
    externalName: null,
    currencyCode: "USD",
    quantity: 10,
    averagePrice: null,
    currentPrice: null,
    unrealizedPnl: null,
    ...overrides,
  };
}

describe("normalizeTrading212Position", () => {
  it("uses the mapped CompassFinance asset name when mapped", () => {
    const result = normalizeTrading212Position(
      trading212Position({ compassAssetId: "aapl", externalName: "Apple Inc" }),
      "2026-09-07T00:00:00.000Z"
    );
    expect(result.displayName).toBe("Apple Inc."); // catalog's real name, not the raw external name
    expect(result.compassAssetId).toBe("aapl");
    expect(result.technicalTicker).toBe("AAPL_US_EQ");
    expect(result.source).toBe("trading212");
    expect(result.lastSyncAt).toBe("2026-09-07T00:00:00.000Z");
  });

  it("falls back to the raw external name, then raw ticker, when unmapped — never guesses a name", () => {
    const withName = normalizeTrading212Position(
      trading212Position({ compassAssetId: null, externalTicker: "VWCE_EQ", externalName: "Vanguard All-World ETF" }),
      null
    );
    expect(withName.displayName).toBe("Vanguard All-World ETF");
    expect(withName.compassAssetId).toBeNull();

    const withoutName = normalizeTrading212Position(
      trading212Position({ compassAssetId: null, externalTicker: "VWCE_EQ", externalName: null }),
      null
    );
    expect(withoutName.displayName).toBe("VWCE_EQ");
  });

  it("computes marketValue from currentPrice × quantity only when currentPrice is available", () => {
    const withPrice = normalizeTrading212Position(trading212Position({ currentPrice: 181.42, quantity: 10 }), null);
    expect(withPrice.marketValue).toBeCloseTo(1814.2);

    const withoutPrice = normalizeTrading212Position(trading212Position({ currentPrice: null }), null);
    expect(withoutPrice.marketValue).toBeNull();
  });

  it("prefers Trading 212's own reported unrealizedPnl over recomputing one", () => {
    const result = normalizeTrading212Position(
      trading212Position({ unrealizedPnl: 314.2, currentPrice: 200, averagePrice: 150, quantity: 10 }),
      null
    );
    // Formula would give 500 — the broker's own real number (314.2, which
    // may already account for fees/FX we don't model) must win.
    expect(result.unrealizedPnl).toBe(314.2);
  });

  it("falls back to (currentPrice - averagePrice) × quantity when Trading 212 supplied no P&L itself", () => {
    const result = normalizeTrading212Position(
      trading212Position({ unrealizedPnl: null, currentPrice: 200, averagePrice: 150, quantity: 10 }),
      null
    );
    expect(result.unrealizedPnl).toBe(500);
  });

  it("never fabricates a P&L when neither a broker value nor both required inputs are available", () => {
    const missingCurrentPrice = normalizeTrading212Position(
      trading212Position({ unrealizedPnl: null, currentPrice: null, averagePrice: 150 }),
      null
    );
    expect(missingCurrentPrice.unrealizedPnl).toBeNull();

    const missingAveragePrice = normalizeTrading212Position(
      trading212Position({ unrealizedPnl: null, currentPrice: 200, averagePrice: null }),
      null
    );
    expect(missingAveragePrice.unrealizedPnl).toBeNull();
  });
});

describe("normalizePaperHolding", () => {
  it("relabels a paper position without altering its already-safe null-when-unavailable fields", () => {
    const position: PaperPositionView = {
      assetId: "nvda",
      symbol: "NVDA",
      name: "NVIDIA Corp.",
      quantity: 5,
      averageEntryPrice: 100,
      currentPrice: null,
      marketValue: null,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
    };

    const result = normalizePaperHolding(position);

    expect(result).toEqual({
      source: "paper",
      compassAssetId: "nvda",
      displayName: "NVIDIA Corp.",
      technicalTicker: "NVDA",
      quantity: 5,
      averagePrice: 100,
      currentPrice: null,
      marketValue: null,
      currency: "USD",
      unrealizedPnl: null,
      lastSyncAt: null,
    });
  });

  it("passes through a real, already-calculated marketValue/unrealizedPnl unchanged", () => {
    const position: PaperPositionView = {
      assetId: "aapl",
      symbol: "AAPL",
      name: "Apple Inc.",
      quantity: 2,
      averageEntryPrice: 150,
      currentPrice: 181.42,
      marketValue: 362.84,
      unrealizedPnl: 62.84,
      unrealizedPnlPercent: 20.9,
    };

    const result = normalizePaperHolding(position);

    expect(result.marketValue).toBe(362.84);
    expect(result.unrealizedPnl).toBe(62.84);
  });
});

describe("normalizeHyperliquidPosition", () => {
  it("maps a native-dex coin (btc/eth) to its CompassFinance asset id", () => {
    const position: HyperliquidPosition = {
      coin: "BTC",
      size: 0.1,
      entryPrice: 60000,
      leverage: 2,
      liquidationPrice: 30000,
      unrealizedPnl: 500,
      marginUsed: 3000,
      positionValue: 6500,
    };

    const result = normalizeHyperliquidPosition(position);

    expect(result.source).toBe("hyperliquid");
    expect(result.compassAssetId).toBe("btc");
    expect(result.displayName).toBe("Bitcoin");
    expect(result.technicalTicker).toBe("BTC");
    expect(result.quantity).toBe(0.1);
    expect(result.marketValue).toBe(6500);
    expect(result.unrealizedPnl).toBe(500);
    expect(result.currency).toBe("USD");
  });

  it("maps a HIP-3 coin (xyz:NVDA) to its CompassFinance asset id", () => {
    const position: HyperliquidPosition = {
      coin: "xyz:NVDA",
      size: 12,
      entryPrice: 170,
      leverage: 1,
      liquidationPrice: null,
      unrealizedPnl: 120,
      marginUsed: 2000,
      positionValue: 2200,
    };

    const result = normalizeHyperliquidPosition(position);

    expect(result.compassAssetId).toBe("nvda");
    expect(result.displayName).toBe("NVIDIA Corp.");
  });

  it("falls back to the raw coin identifier when it doesn't map to any CompassFinance asset", () => {
    const position: HyperliquidPosition = {
      coin: "SOL",
      size: 10,
      entryPrice: 100,
      leverage: 1,
      liquidationPrice: null,
      unrealizedPnl: 0,
      marginUsed: 1000,
      positionValue: 1000,
    };

    const result = normalizeHyperliquidPosition(position);

    expect(result.compassAssetId).toBeNull();
    expect(result.displayName).toBe("SOL");
  });

  it("never derives a currentPrice Hyperliquid didn't directly report", () => {
    const position: HyperliquidPosition = {
      coin: "ETH",
      size: 2,
      entryPrice: 3000,
      leverage: 1,
      liquidationPrice: null,
      unrealizedPnl: 0,
      marginUsed: 6000,
      positionValue: 6000,
    };

    expect(normalizeHyperliquidPosition(position).currentPrice).toBeNull();
  });
});

describe("cross-source aggregation — never merges, always keeps sources distinct", () => {
  it("holding the same CompassFinance asset in Trading 212, Hyperliquid, and Paper Trading yields three separate rows, never one summed position", () => {
    const t212 = normalizeTrading212Position(
      trading212Position({ compassAssetId: "nvda", externalTicker: "NVDA_US_EQ", quantity: 12, currentPrice: 180 }),
      "2026-09-07T00:00:00.000Z"
    );
    const hl = normalizeHyperliquidPosition({
      coin: "xyz:NVDA",
      size: 5,
      entryPrice: 170,
      leverage: 1,
      liquidationPrice: null,
      unrealizedPnl: 50,
      marginUsed: 850,
      positionValue: 900,
    });
    const paper: PaperPositionView = {
      assetId: "nvda",
      symbol: "NVDA",
      name: "NVIDIA Corp.",
      quantity: 3,
      averageEntryPrice: 160,
      currentPrice: 180,
      marketValue: 540,
      unrealizedPnl: 60,
      unrealizedPnlPercent: 12.5,
    };
    const paperNormalized = normalizePaperHolding(paper);

    const sources = [t212, hl, paperNormalized];

    // Every row targets the same asset...
    expect(sources.every((s) => s.compassAssetId === "nvda")).toBe(true);
    // ...but each keeps its OWN quantity/value — nothing here sums them
    // into one combined "27 shares" or one combined market value. The
    // module offers no aggregation function at all; this asserts the
    // shape callers actually receive stays this way.
    expect(sources.map((s) => s.source).sort()).toEqual(["hyperliquid", "paper", "trading212"]);
    expect(sources.map((s) => s.quantity)).toEqual([12, 5, 3]);
    expect(new Set(sources.map((s) => s.quantity)).size).toBe(3);
  });
});
