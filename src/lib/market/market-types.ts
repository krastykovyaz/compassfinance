// Shared, client-safe types for the market-data layer. No fetch logic and
// no Yahoo-specific detail lives here — this file only describes the
// shapes the UI consumes, so it's safe to import from client components.
// The actual Yahoo Finance access lives server-side in
// src/server/market/ and is only reachable through /api/market/*.
//
// The symbol union below is re-exported from the canonical asset catalog
// (src/lib/assets/catalog.ts) rather than declared separately, so the
// market layer and the asset catalog can never drift out of sync — see
// the Milestone 13 "no duplicate asset catalogs" requirement.

import type { AssetId } from "@/lib/assets/catalog";
import { ASSET_CATALOG_ORDER, isAssetId } from "@/lib/assets/catalog";

export type MarketSymbol = AssetId;

export const ALL_MARKET_SYMBOLS: MarketSymbol[] = ASSET_CATALOG_ORDER;

export function isMarketSymbol(value: string): value is MarketSymbol {
  return isAssetId(value);
}

export type MarketAssetQuote = {
  slug: MarketSymbol;
  symbol: string; // display ticker, e.g. "SPX"
  name: string; // display name, e.g. "S&P 500"
  price: number;
  change: number; // absolute change vs previous close
  changePercent: number;
  timestamp: number; // ms epoch of when this quote was produced
};

/** Per-symbol result from /api/market/quote — never fabricated data. */
export type QuoteFetchResult =
  | { slug: MarketSymbol; status: "ok"; quote: MarketAssetQuote }
  | { slug: MarketSymbol; status: "unavailable"; reason: string };

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y";
export const CHART_RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y"];

export type CandlePoint = {
  t: number; // ms epoch
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

/** Result from /api/market/candles — never fabricated data. */
export type CandlesFetchResult =
  | { slug: MarketSymbol; range: ChartRange; status: "ok"; candles: CandlePoint[] }
  | { slug: MarketSymbol; range: ChartRange; status: "unavailable"; reason: string };
