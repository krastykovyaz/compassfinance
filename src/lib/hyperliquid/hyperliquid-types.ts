// Shared, client-safe types for the Hyperliquid data layer. No fetch
// logic and no raw-Hyperliquid-field detail lives here — the actual
// Hyperliquid access lives server-side in src/server/hyperliquid/ and is
// only reachable through /api/hyperliquid/*. Mirrors market-types.ts's
// shape for the existing Yahoo pipeline.

export type HyperliquidMarketSnapshot = {
  assetId: string; // Hyperliquid's own coin symbol, e.g. "BTC" — technical only, never shown as a primary label
  symbol: string;
  /** Human-readable name from CompassFinance's own asset catalog (e.g.
   * "Bitcoin"), NOT the raw Hyperliquid coin symbol — this is what the UI
   * shows as the primary label. Only ever a real ASSET_CATALOG name: this
   * type is only ever constructed for a market that already resolved to
   * a CompassFinance asset (see compassAssetId), never a raw passthrough. */
  displayName: string;
  /** The CompassFinance catalog id (e.g. "btc") this market belongs to —
   * the one field to route/link/look up catalog details by. Never the
   * Hyperliquid coin symbol, so routing never depends on a compass slug
   * happening to match a lowercased coin symbol by coincidence. */
  compassAssetId: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  fundingRate: number;
  timestamp: number;
  /** From Hyperliquid's meta.universe — the maximum leverage this market
   * permits. Used by the Phase 3 order-preview calculator. */
  maxLeverage: number;
  /** Hyperliquid's own numeric asset index — order/leverage actions
   * reference assets by this index, never by symbol. */
  assetIndex: number;
  /** Decimal places Hyperliquid allows for this asset's order size (also
   * bounds price precision). Used by the Phase 4 order signer to format a
   * valid price/size before signing. */
  szDecimals: number;
  /** "native" for the standard/main Hyperliquid dex (btc/eth today),
   * "hip3" for a builder-deployed perp dex (e.g. "xyz"'s stocks/gold/
   * oil/SP500) — HIP-3 markets have a materially different trust model
   * (the deployer sets its own oracle price) and an ISOLATED margin pool
   * separate from the main dex's balance. The Details panel and the
   * trading page's balance section both branch on this. */
  venue: "native" | "hip3";
  /** HIP-3 dex short name ("xyz"), or null for a native-venue market. */
  dex: string | null;
  /** The dex's own display name ("XYZ"), or null for a native-venue
   * market — shown in the Details panel's "Oracle/deployer" row. */
  dexFullName: string | null;
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

// ---------------------------------------------------------------------------
// Phase 4 — real order execution. Signing happens entirely client-side,
// inside the user's own wallet, before any of this is sent anywhere —
// these types describe an ALREADY-SIGNED submission and the real result
// /api/hyperliquid/order returns, never a private key or signing material.
// ---------------------------------------------------------------------------

export type HyperliquidSignature = { r: string; s: string; v: number };

/** Body POSTed to /api/hyperliquid/order — `action`/`nonce`/`signature`
 * are exactly what the wallet signed, forwarded as-is. */
export type HyperliquidExchangeSubmission = {
  address: string;
  action: Record<string, unknown>;
  nonce: number;
  signature: HyperliquidSignature;
};

export type HyperliquidExchangeRejectionReason =
  | "disabled"
  | "unknown-action-type"
  | "unknown-coin"
  | "leverage-exceeds-max"
  | "insufficient-balance"
  | "invalid-request"
  | "real-trading-locked"
  | "invalid-transfer";

export type HyperliquidExchangeResult =
  | { status: "resting"; orderId: number }
  | { status: "filled"; orderId: number; totalSize: number; avgPrice: number }
  | { status: "pending" }
  | { status: "rejected"; reason: HyperliquidExchangeRejectionReason; message: string }
  | { status: "hyperliquid-rejected"; message: string }
  | { status: "network-failure"; message: string };
