// Shared, client-safe types for the Hyperliquid data layer. No fetch
// logic and no raw-Hyperliquid-field detail lives here — the actual
// Hyperliquid access lives server-side in src/server/hyperliquid/ and is
// only reachable through /api/hyperliquid/*. Mirrors market-types.ts's
// shape for the existing Yahoo pipeline.

export type HyperliquidMarketSnapshot = {
  assetId: string; // Hyperliquid's own coin symbol, e.g. "BTC"
  symbol: string;
  displayName: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  fundingRate: number;
  timestamp: number;
};

/** From /api/hyperliquid/markets — never fabricated data. */
export type HyperliquidMarketsFetchResult =
  | { status: "ok"; markets: HyperliquidMarketSnapshot[] }
  | { status: "unavailable"; reason: string };

/** Deliberately identical shape to market-types.ts's CandlePoint, so
 * components can consume either without modification. */
export type HyperliquidCandlePoint = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

/** From /api/hyperliquid/candles — never fabricated data. */
export type HyperliquidCandlesFetchResult =
  | { status: "ok"; coin: string; range: string; candles: HyperliquidCandlePoint[] }
  | { status: "unavailable"; coin: string; range: string; reason: string };

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

/** From /api/hyperliquid/orderbook — never fabricated data. */
export type HyperliquidOrderBookFetchResult =
  | { status: "ok"; book: HyperliquidOrderBook }
  | { status: "unavailable"; coin: string; reason: string };

// ---------------------------------------------------------------------------
// Account (Phase 2) — read-only, address-keyed. Never contains a private
// key, seed phrase, or internal Compass user id.
// ---------------------------------------------------------------------------

export type HyperliquidPosition = {
  coin: string;
  size: number;
  entryPrice: number | null;
  leverage: number;
  liquidationPrice: number | null;
  unrealizedPnl: number;
  marginUsed: number;
  positionValue: number;
};

export type HyperliquidAccountSnapshot = {
  accountValue: number;
  withdrawableBalance: number;
  totalMarginUsed: number;
  positions: HyperliquidPosition[];
  timestamp: number;
};

export type HyperliquidOpenOrder = {
  coin: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  orderId: number;
  timestamp: number;
};

export type HyperliquidFill = {
  coin: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  closedPnl: number;
  fee: number;
  timestamp: number;
};

/** From /api/hyperliquid/account — never fabricated data. */
export type HyperliquidAccountFetchResult =
  | { status: "ok"; account: HyperliquidAccountSnapshot }
  | { status: "unavailable"; reason: string };

export type HyperliquidOpenOrdersFetchResult =
  | { status: "ok"; orders: HyperliquidOpenOrder[] }
  | { status: "unavailable"; reason: string };

export type HyperliquidFillsFetchResult =
  | { status: "ok"; fills: HyperliquidFill[] }
  | { status: "unavailable"; reason: string };
