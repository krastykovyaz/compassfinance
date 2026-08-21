// Maps the chart ranges Compass's UI exposes to the `range`/`interval`
// query parameters Yahoo Finance's chart endpoint expects, plus a cache
// TTL appropriate for how often that range's data actually changes.
//
// Yahoo's intraday intervals (anything under 1d) are only retained for a
// limited lookback window server-side, which is exactly why longer ranges
// step up to daily/weekly/monthly candles below — asking Yahoo for 5 years
// of 5-minute candles would be rejected anyway.

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y";

export const CHART_RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y"];

export function isChartRange(value: string): value is ChartRange {
  return (CHART_RANGES as string[]).includes(value);
}

type YahooRangeParams = {
  range: string;
  interval: string;
  /** How long a cached response for this range may be served before refetching. */
  cacheTtlMs: number;
};

const RANGE_TO_YAHOO_PARAMS: Record<ChartRange, YahooRangeParams> = {
  "1D": { range: "1d", interval: "5m", cacheTtlMs: 15_000 },
  "1W": { range: "5d", interval: "15m", cacheTtlMs: 60_000 },
  "1M": { range: "1mo", interval: "1d", cacheTtlMs: 5 * 60_000 },
  "3M": { range: "3mo", interval: "1d", cacheTtlMs: 15 * 60_000 },
  "1Y": { range: "1y", interval: "1wk", cacheTtlMs: 60 * 60_000 },
  "5Y": { range: "5y", interval: "1mo", cacheTtlMs: 6 * 60 * 60_000 },
};

export function mapRangeToYahooParams(range: ChartRange): YahooRangeParams {
  return RANGE_TO_YAHOO_PARAMS[range];
}
