// Stable, provider-agnostic shapes the rest of Compass consumes. UI code
// never sees a raw Hyperliquid field name — everything here is what
// service.ts normalizes raw responses into, so the adapter can be
// extended (or a market added/removed) without any UI change.

export type HyperliquidMarketSnapshot = {
  /** Hyperliquid's own coin symbol, e.g. "BTC" — technical only, never shown as a primary label. */
  assetId: string;
  symbol: string;
  /** Human-readable name from ASSET_CATALOG (e.g. "Bitcoin"), never the
   * raw Hyperliquid coin symbol. */
  displayName: string;
  /** The CompassFinance catalog id (e.g. "btc") this market belongs to. */
  compassAssetId: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  fundingRate: number;
  timestamp: number;
  /** From Hyperliquid's meta.universe — the maximum leverage this market
   * permits. Used by the Phase 3 order-preview calculator; never used to
   * gate anything about the market snapshot itself. */
  maxLeverage: number;
  /** Hyperliquid's own numeric asset index (its universe array position) —
   * order/leverage actions reference assets by this index, never by
   * symbol. From the same meta.universe entry as maxLeverage. */
  assetIndex: number;
  /** Decimal places Hyperliquid allows for this asset's order size — also
   * bounds price precision (price allows at most 6 - szDecimals decimal
   * places for perps). From the same meta.universe entry. */
  szDecimals: number;
  /** "native" for the standard/main Hyperliquid dex, "hip3" for a
   * builder-deployed perp dex — see asset-mapping.ts's header comment for
   * the trust/isolated-margin distinction this drives downstream. */
  venue: "native" | "hip3";
  dex: string | null;
  dexFullName: string | null;
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

// ---------------------------------------------------------------------------
// Account (Phase 2) — read-only, address-keyed. Never contains a private
// key, seed phrase, or internal Compass user id; everything here is what
// Hyperliquid itself reports as public account state for a given address.
// ---------------------------------------------------------------------------

export type HyperliquidPosition = {
  /** Hyperliquid's own coin symbol — same identifier space as
   * HyperliquidMarketSnapshot.assetId, no separate mapping needed. */
  coin: string;
  /** Signed size — negative is short. */
  size: number;
  entryPrice: number | null;
  leverage: number;
  /** null when Hyperliquid reports no liquidation price for this position
   * (e.g. fully covered) — never computed/estimated here. */
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

export type HyperliquidAccountResult =
  | { status: "ok"; account: HyperliquidAccountSnapshot }
  | { status: "unavailable"; reason: string };

export type HyperliquidOpenOrdersResult =
  | { status: "ok"; orders: HyperliquidOpenOrder[] }
  | { status: "unavailable"; reason: string };

export type HyperliquidFillsResult =
  | { status: "ok"; fills: HyperliquidFill[] }
  | { status: "unavailable"; reason: string };

// ---------------------------------------------------------------------------
// Phase 4 — real order execution. The server never signs anything; every
// signature is produced client-side, inside the user's own wallet, before
// submitHyperliquidExchangeAction() is ever called. This layer only
// validates and relays an already-signed action, then classifies the real
// response Hyperliquid sends back — it never fabricates a fill or a
// balance, and never optimistically reports success before Hyperliquid
// itself has answered.
// ---------------------------------------------------------------------------

/** The only action types this relay will ever forward — anything else is
 * rejected before Hyperliquid is ever contacted. Deliberately NOT a
 * generic signed-action proxy. sendAsset (Phase 8) is the one exception
 * to "trading actions only" — it's the collateral transfer used to fund/
 * withdraw a HIP-3 dex's isolated margin pool, validated far more
 * strictly than the others (see submitHyperliquidExchangeAction). */
export type HyperliquidExchangeActionType = "updateLeverage" | "order" | "approveAgent" | "sendAsset";

export type HyperliquidSignature = { r: string; s: string; v: number };

/** What the client sends after signing — the action object must be
 * forwarded byte-identical to what was actually signed, never
 * reconstructed (the signature's hash depends on exact key order). */
export type HyperliquidExchangeSubmission = {
  action: Record<string, unknown>;
  nonce: number;
  signature: HyperliquidSignature;
};

/** Why this server's OWN pre-flight check refused to even contact
 * Hyperliquid — distinct from a rejection Hyperliquid itself returns. */
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
  /** updateLeverage's plain ok response, or an order's rare
   * "waitingForFill"/"waitingForTrigger" status — Phase 4 places market
   * orders only, so a trigger order should never actually occur here. */
  | { status: "pending" }
  /** Rejected by OUR OWN pre-flight validation — never reached Hyperliquid. */
  | { status: "rejected"; reason: HyperliquidExchangeRejectionReason; message: string }
  /** Hyperliquid itself returned an error status for this action. */
  | { status: "hyperliquid-rejected"; message: string }
  /** Could not even determine whether Hyperliquid received the action
   * (timeout/network failure after — or possibly during — submission).
   * The caller must never treat this as "failed": it may have filled. */
  | { status: "network-failure"; message: string };
