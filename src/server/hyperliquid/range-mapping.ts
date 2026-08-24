// Maps Compass's UI chart ranges to the interval/lookback Hyperliquid's
// candleSnapshot endpoint expects. Reuses the same ChartRange union as the
// Yahoo pipeline (src/server/market/range-mapping.ts) rather than
// redeclaring it — the UI concept of "1D/1W/1M/..." is provider-agnostic,
// only the resulting interval string and cache TTL are Hyperliquid-specific.

import type { ChartRange } from "@/server/market/range-mapping";

export type { ChartRange } from "@/server/market/range-mapping";
export { isChartRange } from "@/server/market/range-mapping";

type HyperliquidRangeParams = {
  interval: string;
  lookbackMs: number;
  cacheTtlMs: number;
};

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

// Only ranges Hyperliquid can realistically serve are mapped here; "5Y" is
// deliberately absent — Hyperliquid's candle history doesn't reliably
// retain that far back at a usable interval, and guessing wrong would mean
// silently returning a mismatched series instead of a clear "unavailable".
const RANGE_TO_HYPERLIQUID_PARAMS: Partial<Record<ChartRange, HyperliquidRangeParams>> = {
  "1D": { interval: "5m", lookbackMs: DAY_MS, cacheTtlMs: 15_000 },
  "1W": { interval: "1h", lookbackMs: 7 * DAY_MS, cacheTtlMs: 60_000 },
  "1M": { interval: "4h", lookbackMs: 30 * DAY_MS, cacheTtlMs: 5 * 60_000 },
  "3M": { interval: "1d", lookbackMs: 90 * DAY_MS, cacheTtlMs: 15 * 60_000 },
  "1Y": { interval: "1d", lookbackMs: 365 * DAY_MS, cacheTtlMs: 60 * 60_000 },
};

export function mapRangeToHyperliquidParams(range: ChartRange): HyperliquidRangeParams | null {
  return RANGE_TO_HYPERLIQUID_PARAMS[range] ?? null;
}
