// Canonical paper-trading types (Milestone 16). One definition each for
// Asset/Position/Trade/Account — Home, Portfolio, Position, and Markets
// all import from here rather than each declaring their own shape.

import type { AssetId } from "@/lib/assets/catalog";

export type TradeSide = "BUY" | "SELL";

export type PaperPositionView = {
  assetId: AssetId;
  symbol: string;
  name: string;
  quantity: number;
  averageEntryPrice: number;
  /** Null when market data is unavailable for this asset right now — never a fabricated price. */
  currentPrice: number | null;
  /** quantity * currentPrice, or null when currentPrice is unavailable. */
  marketValue: number | null;
  /** (currentPrice - averageEntryPrice) * quantity, or null when currentPrice is unavailable. */
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
};

export type PaperTradeView = {
  id: string;
  assetId: AssetId;
  side: TradeSide;
  quantity: number;
  executionPrice: number;
  /** Set only on a SELL — the realized gain/loss for that specific sell. */
  realizedPnl: number | null;
  createdAt: string; // ISO
};

export type PaperAccountView = {
  cashBalance: number;
  /** cashBalance + sum(marketValue) over positions with an available price. */
  portfolioValue: number;
  /** sum(marketValue) over positions with an available price — the invested portion of portfolioValue. */
  investedValue: number;
  /** sum(unrealizedPnl) over positions with an available price. */
  unrealizedPnl: number;
  /** sum(realizedPnl) over every SELL trade ever made. */
  realizedPnl: number;
  positions: PaperPositionView[];
  trades: PaperTradeView[];
  /** assetIds currently held whose live price couldn't be fetched — those positions are excluded from portfolioValue/investedValue/unrealizedPnl above rather than guessed at. */
  pricesUnavailableFor: AssetId[];
};

export type PlaceTradeRequest = {
  assetId: AssetId;
  side: TradeSide;
  quantity: number;
};

export type PlaceTradeResult =
  | { status: "ok"; account: PaperAccountView }
  | { status: "error"; reason: string };

// Real portfolio-value history (Milestone 17) — points are only ever
// actually-recorded snapshots (plus the current live value as the final
// point), never interpolated or invented.
export type PerformanceRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
export const PERFORMANCE_RANGES: PerformanceRange[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

export type PerformancePoint = {
  t: number; // ms epoch
  v: number; // portfolio value at that time
};
