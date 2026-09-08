// Provider-neutral portfolio aggregation layer (Phase 3). This module
// deliberately does NOT fetch anything itself — Trading 212, Paper
// Trading, and Hyperliquid each already have their own established data
// path (a DB-backed repository for Trading 212, a polled REST context for
// Paper Trading, a live-wallet-fetched context for Hyperliquid), and
// forcing all three through one fetch layer would mean either inventing a
// fake unified backend for Hyperliquid's live, wallet-signed data or
// duplicating its fetch logic here. Instead, this is a pure, shared
// TARGET SHAPE (`SourcedPosition`) plus one normalizer per source —
// callers already holding that source's own data map it into this shape
// for display, and every position keeps its own `source` tag so nothing
// is ever silently merged across sources (see the Portfolio page and
// asset-detail page, which array these side by side, never sum them into
// one number).

import type { AssetId } from "@/lib/assets/catalog";
import { getAsset } from "@/lib/assets/catalog";
import type { Trading212PositionDTO } from "@/server/repositories/trading212-portfolio-repository";
import type { PaperPositionView } from "@/lib/trading/types";
import type { HyperliquidPosition } from "@/lib/hyperliquid/hyperliquid-types";
import { getAssetIdForHyperliquidCoin } from "@/lib/hyperliquid/asset-mapping";

export type PortfolioSource = "trading212" | "hyperliquid" | "paper";

export type SourcedPosition = {
  source: PortfolioSource;
  /** The CompassFinance asset this position was mapped to, or null when
   * the source's own instrument couldn't be confidently mapped (Trading
   * 212 only — Paper Trading and Hyperliquid positions are always keyed
   * by a CompassFinance asset id already). */
  compassAssetId: AssetId | null;
  /** Human-readable name — the mapped CompassFinance asset's name when
   * available, otherwise the source's own raw instrument name/symbol.
   * Never a bare technical ticker when a real name is known. */
  displayName: string;
  /** The source's own raw ticker/coin identifier, always preserved
   * regardless of mapping (e.g. "AAPL_US_EQ", "xyz:NVDA", "nvda"). */
  technicalTicker: string | null;
  quantity: number;
  averagePrice: number | null;
  currentPrice: number | null;
  /** Only ever a real number the source itself reported or a value
   * mechanically derived from two real numbers (e.g. quantity ×
   * currentPrice) — never estimated from historical transactions. */
  marketValue: number | null;
  currency: string | null;
  /** Only ever the source's own real reported P&L, or —for Trading
   * 212, whose stored position doesn't always carry one— computed as
   * (currentPrice - averagePrice) × quantity when BOTH real inputs are
   * present. Null when neither is available; never estimated. */
  unrealizedPnl: number | null;
  /** ISO timestamp of the last successful sync, for sources backed by a
   * DB sync (Trading 212 only) — null for live-fetched sources
   * (Hyperliquid, Paper Trading), which have no "sync" concept. */
  lastSyncAt: string | null;
};

export function normalizeTrading212Position(
  position: Trading212PositionDTO,
  lastSyncAt: string | null
): SourcedPosition {
  const asset = position.compassAssetId ? getAsset(position.compassAssetId) : undefined;
  const marketValue = position.currentPrice != null ? position.currentPrice * position.quantity : null;
  const unrealizedPnl =
    position.unrealizedPnl ??
    (position.currentPrice != null && position.averagePrice != null
      ? (position.currentPrice - position.averagePrice) * position.quantity
      : null);

  return {
    source: "trading212",
    compassAssetId: (position.compassAssetId as AssetId | null) ?? null,
    displayName: asset?.name ?? position.externalName ?? position.externalTicker,
    technicalTicker: position.externalTicker,
    quantity: position.quantity,
    averagePrice: position.averagePrice,
    currentPrice: position.currentPrice,
    marketValue,
    currency: position.currencyCode,
    unrealizedPnl,
    lastSyncAt,
  };
}

// Paper Trading is always denominated in USD (see formatCurrency's own
// fixed "USD" — there is no multi-currency paper account anywhere in this
// app) and already computes marketValue/unrealizedPnl the same
// never-fabricate way (see PaperPositionView's own field comments) — this
// normalizer is a pure relabeling, no new calculation.
export function normalizePaperHolding(position: PaperPositionView): SourcedPosition {
  return {
    source: "paper",
    compassAssetId: position.assetId,
    displayName: position.name,
    technicalTicker: position.symbol,
    quantity: position.quantity,
    averagePrice: position.averageEntryPrice,
    currentPrice: position.currentPrice,
    marketValue: position.marketValue,
    currency: "USD",
    unrealizedPnl: position.unrealizedPnl,
    lastSyncAt: null,
  };
}

// Hyperliquid positions are always USDC-margined (effectively USD) and
// live-fetched, never DB-synced — positionValue/unrealizedPnl are passed
// through exactly as Hyperliquid itself reported them, never rederived
// (e.g. never divide positionValue by size to invent a "current price"
// Hyperliquid didn't give us directly).
export function normalizeHyperliquidPosition(position: HyperliquidPosition): SourcedPosition {
  const compassAssetId = getAssetIdForHyperliquidCoin(position.coin);
  const asset = compassAssetId ? getAsset(compassAssetId) : undefined;

  return {
    source: "hyperliquid",
    compassAssetId,
    displayName: asset?.name ?? position.coin,
    technicalTicker: position.coin,
    quantity: position.size,
    averagePrice: position.entryPrice,
    currentPrice: null,
    marketValue: position.positionValue,
    currency: "USD",
    unrealizedPnl: position.unrealizedPnl,
    lastSyncAt: null,
  };
}
