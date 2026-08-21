// Stable, provider-agnostic shapes the rest of Compass consumes. UI code
// never sees a raw Hyperliquid field name — everything here is what
// service.ts normalizes raw responses into, so the adapter can be
// extended (or a market added/removed) without any UI change.

export type HyperliquidMarketSnapshot = {
  /** Hyperliquid's own coin symbol, e.g. "BTC" — the id this market is addressed by throughout. */
  assetId: string;
  symbol: string;
  displayName: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  fundingRate: number;
  timestamp: number;
};

/** Deliberately identical shape to src/server/market/service.ts's CandlePoint
 * so components (price-chart.tsx) can consume either without modification. */
export type HyperliquidCandlePoint = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

export type HyperliquidOrderBookLevel = {
  price: number;
  size: number;
};

export type HyperliquidOrderBook = {
  coin: string;
  bids: HyperliquidOrderBookLevel[];
  asks: HyperliquidOrderBookLevel[];
  timestamp: number;
};

export type HyperliquidMarketsResult =
  | { status: "ok"; markets: HyperliquidMarketSnapshot[] }
  | { status: "unavailable"; reason: string };

export type HyperliquidCandlesResult =
  | { status: "ok"; coin: string; range: string; candles: HyperliquidCandlePoint[] }
  | { status: "unavailable"; coin: string; range: string; reason: string };

export type HyperliquidOrderBookResult =
  | { status: "ok"; book: HyperliquidOrderBook }
  | { status: "unavailable"; coin: string; reason: string };
