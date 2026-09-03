// The single server-side Hyperliquid adapter for Compass. Everything that
// needs a real Hyperliquid price, candle series, or order book goes
// through the three functions here — nothing else in the codebase should
// import client.ts directly. Mirrors src/server/market/service.ts's shape
// exactly: every function is gated on isHyperliquidEnabled() first (no
// network call at all when disabled), returns a discriminated "ok" |
// "unavailable" result, and NEVER fabricates a substitute value — there is
// no mock Hyperliquid provider anywhere in this codebase, so "disabled" or
// "upstream failed" both mean the same honest "unavailable" to the caller.

import { getOrFetch, invalidate } from "@/server/market/cache";
import { isHyperliquidEnabled } from "./config";
import {
  isTradableHyperliquidCoin,
  getAssetIdForHyperliquidCoin,
  getConfiguredHip3DexNames,
  getHip3DexName,
  getHip3DexFullName,
} from "@/lib/hyperliquid/asset-mapping";
import { isRealTradingUnlocked } from "@/lib/hyperliquid/real-trading-access";
import { getAsset } from "@/lib/assets/catalog";
import { getServerLearningProgress } from "@/server/repositories/learning-repository";
import { getHyperliquidUniverse, getHyperliquidPerpDexIndex, getUsdcTokenId } from "./markets";
import {
  fetchMetaAndAssetCtxs,
  fetchCandleSnapshot,
  fetchL2Book,
  fetchClearinghouseState,
  fetchOpenOrders,
  fetchUserFills,
  fetchUserAbstraction,
  fetchSpotClearinghouseState,
  postExchange,
  type HyperliquidRawPosition,
} from "./client";
import { isChartRange, mapRangeToHyperliquidParams, type ChartRange } from "./range-mapping";
import type {
  HyperliquidMarketSnapshot,
  HyperliquidMarketsResult,
  HyperliquidCandlePoint,
  HyperliquidCandlesResult,
  HyperliquidOrderBookLevel,
  HyperliquidOrderBookResult,
  HyperliquidPosition,
  HyperliquidAccountResult,
  HyperliquidOpenOrdersResult,
  HyperliquidFillsResult,
  HyperliquidExchangeActionType,
  HyperliquidExchangeResult,
  HyperliquidSignature,
} from "./types";

export type { ChartRange };

const MARKETS_CACHE_TTL_MS = 15_000;
const ORDER_BOOK_CACHE_TTL_MS = 2_000;
// Shorter than the market-list TTL — this is the user's own money, so a
// tighter staleness bound is worth the extra upstream calls.
const ACCOUNT_CACHE_TTL_MS = 10_000;

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Snapshots for one dex's worth of Hyperliquid perpetuals (the native/
 * main dex when `dex` is undefined, otherwise one builder-deployed HIP-3
 * dex) — the one place that parses meta+assetCtxs into
 * HyperliquidMarketSnapshot[], reused by getHyperliquidMarkets for both.
 * A HIP-3 dex this Hyperliquid deployment doesn't currently resolve (or
 * whose fetch fails) degrades to an empty list rather than throwing —
 * that dex's markets are just missing, native BTC/ETH must never go down
 * because of it. A native-dex failure DOES throw (a real outage), exactly
 * matching this function's pre-Phase-8 behavior. */
async function buildDexMarketSnapshots(
  dex: string | undefined,
  venue: "native" | "hip3",
  dexFullName: string | null,
  timestamp: number
): Promise<HyperliquidMarketSnapshot[]> {
  let dexIndex = 0;
  if (dex) {
    const idx = await getHyperliquidPerpDexIndex(dex);
    if (idx === null) return [];
    dexIndex = idx;
  }

  const fetched = await fetchMetaAndAssetCtxs(dex);
  if (!fetched.ok) {
    if (!dex) throw new Error(fetched.message);
    return [];
  }
  const [meta, assetCtxs] = fetched.data;

  const result: HyperliquidMarketSnapshot[] = [];
  for (let i = 0; i < meta.universe.length; i++) {
    const coin = meta.universe[i].name;

    // Filter to approved CompassFinance assets only — Hyperliquid's
    // universe (native + every HIP-3 dex combined) has hundreds of
    // markets total, and this app must never show "a list of raw
    // Hyperliquid markets" (see asset-mapping.ts for exactly which coins
    // are approved and why). This is the one place that decides what
    // Markets is even allowed to see.
    const compassAssetId = getAssetIdForHyperliquidCoin(coin);
    if (!compassAssetId) continue;
    const catalogEntry = getAsset(compassAssetId);
    if (!catalogEntry) continue; // defensive — mapping should never point at a missing catalog entry

    // A delisted market has no live oracle/trading activity even though
    // its name still appears in meta — verified live (xyz:SP500 and
    // xyz:BRENTOIL are both delisted on testnet, though fully live on
    // mainnet). Showing it as tradeable would be a stale/fake price with
    // no real market behind it, exactly what this app never does.
    if (meta.universe[i].isDelisted) continue;

    const maxLeverage = meta.universe[i].maxLeverage;
    const szDecimals = meta.universe[i].szDecimals;
    const ctx = assetCtxs[i];
    const price = toNumber(ctx.markPx);
    const prevDayPx = toNumber(ctx.prevDayPx);
    const volume24h = toNumber(ctx.dayNtlVlm);
    const fundingRate = toNumber(ctx.funding);

    if (
      [price, prevDayPx, volume24h, fundingRate].some(Number.isNaN) ||
      !Number.isFinite(maxLeverage) ||
      !Number.isFinite(szDecimals)
    ) {
      console.error(`[hyperliquid-service] skipping ${coin}: non-numeric field in asset context`);
      continue;
    }

    const change24h = price - prevDayPx;
    const changePercent24h = prevDayPx !== 0 ? (change24h / prevDayPx) * 100 : 0;
    // Native: a plain universe index. HIP-3: Hyperliquid's own documented
    // asset-id formula (100000 + perp_dex_index*10000 + index_in_meta) —
    // computed fresh every fetch, never hardcoded, so a market's order-
    // ready id stays correct even if a dex's universe gets reordered.
    const assetIndex = dex ? 100000 + dexIndex * 10000 + i : i;

    result.push({
      assetId: coin,
      symbol: coin,
      displayName: catalogEntry.name,
      compassAssetId,
      price,
      change24h,
      changePercent24h,
      volume24h,
      fundingRate,
      timestamp,
      maxLeverage,
      assetIndex,
      szDecimals,
      venue,
      dex: dex ?? null,
      dexFullName,
    });
  }
  return result;
}

/**
 * Live snapshot (price, 24h change/volume, funding) for every Hyperliquid
 * perpetual market Compass has approved — native dex plus every
 * configured HIP-3 dex. A market whose fields don't parse cleanly is
 * skipped (logged) rather than shown with a fabricated number — mirrors
 * yahoo-client.ts's null-candle-skip idiom.
 */
export async function getHyperliquidMarkets(): Promise<HyperliquidMarketsResult> {
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", reason: "disabled" };
  }

  try {
    const markets = await getOrFetch("hl:markets", MARKETS_CACHE_TTL_MS, async () => {
      const timestamp = Date.now();
      const result = await buildDexMarketSnapshots(undefined, "native", null, timestamp);
      for (const dexName of getConfiguredHip3DexNames()) {
        const hip3 = await buildDexMarketSnapshots(dexName, "hip3", getHip3DexFullName(dexName), timestamp);
        result.push(...hip3);
      }
      return result;
    });

    return { status: "ok", markets };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Hyperliquid market data unavailable";
    return { status: "unavailable", reason };
  }
}

export async function getHyperliquidCandles(coin: string, range: string): Promise<HyperliquidCandlesResult> {
  if (!isChartRange(range)) {
    return { status: "unavailable", coin, range: "1D", reason: `Unsupported range: ${range}` };
  }
  if (!coin || !coin.trim()) {
    return { status: "unavailable", coin, range, reason: "coin is required" };
  }
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", coin, range, reason: "disabled" };
  }

  const params = mapRangeToHyperliquidParams(range);
  if (!params) {
    return { status: "unavailable", coin, range, reason: `Range not supported by Hyperliquid: ${range}` };
  }

  try {
    const candles = await getOrFetch(`hl:candles:${coin}:${range}`, params.cacheTtlMs, async () => {
      const endTime = Date.now();
      const startTime = endTime - params.lookbackMs;
      const fetched = await fetchCandleSnapshot(coin, params.interval, startTime, endTime);
      if (!fetched.ok) {
        throw new Error(fetched.message);
      }

      const points: HyperliquidCandlePoint[] = [];
      for (const raw of fetched.data) {
        const o = toNumber(raw.o);
        const h = toNumber(raw.h);
        const l = toNumber(raw.l);
        const c = toNumber(raw.c);
        const v = toNumber(raw.v);
        if ([o, h, l, c].some(Number.isNaN)) continue; // skip, never fabricate
        points.push({ t: raw.t, o, h, l, c, v: Number.isNaN(v) ? null : v });
      }
      if (points.length === 0) {
        throw new Error(`No usable candles for ${coin}`);
      }
      return points;
    });

    return { status: "ok", coin, range, candles };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Hyperliquid candle data unavailable";
    return { status: "unavailable", coin, range, reason };
  }
}

export async function getHyperliquidOrderBook(coin: string): Promise<HyperliquidOrderBookResult> {
  if (!coin || !coin.trim()) {
    return { status: "unavailable", coin, reason: "coin is required" };
  }
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", coin, reason: "disabled" };
  }

  try {
    const book = await getOrFetch(`hl:orderbook:${coin}`, ORDER_BOOK_CACHE_TTL_MS, async () => {
      const fetched = await fetchL2Book(coin);
      if (!fetched.ok) {
        throw new Error(fetched.message);
      }

      const normalizeLevels = (levels: { px: string; sz: string }[]): HyperliquidOrderBookLevel[] =>
        levels
          .map((l) => ({ price: toNumber(l.px), size: toNumber(l.sz) }))
          .filter((l) => !Number.isNaN(l.price) && !Number.isNaN(l.size));

      return {
        coin: fetched.data.coin,
        bids: normalizeLevels(fetched.data.levels[0]),
        asks: normalizeLevels(fetched.data.levels[1]),
        timestamp: fetched.data.time,
      };
    });

    return { status: "ok", book };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Hyperliquid order book unavailable";
    return { status: "unavailable", coin, reason };
  }
}

// --- Account (Phase 2) — read-only, address-keyed. No internal Compass
// user id is ever passed into these functions or the upstream call; the
// route above this layer only ever supplies a wallet address. ---

/** "B" = bid/buy, "A" = ask/sell — Hyperliquid's own side convention. */
function normalizeSide(raw: string): "BUY" | "SELL" | null {
  if (raw === "B") return "BUY";
  if (raw === "A") return "SELL";
  return null;
}

/** Normalizes one raw position, or returns null (skip, log) if any
 * required numeric field — including the nested leverage object — doesn't
 * parse as expected. Never fabricates a value for a field that's missing. */
function normalizePosition(raw: HyperliquidRawPosition): HyperliquidPosition | null {
  const size = toNumber(raw.szi);
  const unrealizedPnl = toNumber(raw.unrealizedPnl);
  const marginUsed = toNumber(raw.marginUsed);
  const positionValue = toNumber(raw.positionValue);
  const entryPrice = raw.entryPx !== null ? toNumber(raw.entryPx) : null;
  const liquidationPrice = raw.liquidationPx !== null ? toNumber(raw.liquidationPx) : null;
  const leverage = typeof raw.leverage?.value === "number" && Number.isFinite(raw.leverage.value)
    ? raw.leverage.value
    : NaN;

  const requiredFieldsOk = [size, unrealizedPnl, marginUsed, positionValue, leverage].every(
    (n) => !Number.isNaN(n)
  );
  const optionalFieldsOk = (entryPrice === null || !Number.isNaN(entryPrice)) &&
    (liquidationPrice === null || !Number.isNaN(liquidationPrice));

  if (!requiredFieldsOk || !optionalFieldsOk) {
    console.error(`[hyperliquid-service] skipping ${raw.coin}: non-numeric field in position`);
    return null;
  }

  return { coin: raw.coin, size, entryPrice, leverage, liquidationPrice, unrealizedPnl, marginUsed, positionValue };
}

/** Unified Account Mode (a setting the user enables in Hyperliquid's own
 * app) makes the classic clearinghouseState balance/withdrawable figures
 * stale/not meaningful — real collateral lives in the spot clearinghouse
 * state instead. Detects it and, when present, returns the real
 * accountValue/withdrawableBalance to use instead; returns null (not
 * unified, or detection/lookup failed) when the caller should keep
 * whatever classic clearinghouseState values it already has. Shared by
 * getHyperliquidAccount (cached) and submitHyperliquidExchangeAction's
 * pre-flight balance check (deliberately uncached) — same override,
 * two different staleness requirements. */
async function getUnifiedAccountOverride(
  address: string
): Promise<{ accountValue: number; withdrawableBalance: number } | null> {
  const abstraction = await fetchUserAbstraction(address);
  if (!abstraction.ok || abstraction.data !== "unifiedAccount") return null;

  const spot = await fetchSpotClearinghouseState(address);
  if (!spot.ok) return null;

  const usdc = spot.data.balances.find((b) => b.coin === "USDC");
  const usdcTotal = usdc ? toNumber(usdc.total) : NaN;
  if (!usdc || Number.isNaN(usdcTotal)) return null;

  const availableEntry = spot.data.tokenToAvailableAfterMaintenance?.find(([token]) => token === usdc.token);
  const available = availableEntry ? toNumber(availableEntry[1]) : NaN;
  return { accountValue: usdcTotal, withdrawableBalance: Number.isNaN(available) ? usdcTotal : available };
}

/** `dex` selects which margin pool to read — omitted (native) reads the
 * main dex, exactly the pre-Phase-8 behavior BTC/ETH still use. A HIP-3
 * dex's pool is ISOLATED from the main one (verified live: the same
 * address holds a genuinely different accountValue with dex:"xyz" than
 * without it), so this is never a filtered view of one shared number —
 * it's a real, separate fetch. Unified Account Mode's spot<->perp
 * override only ever applies to the main dex's own balance (there is no
 * evidence, and this codebase makes no assumption, that it reaches into
 * an isolated HIP-3 pool too) — so it's skipped entirely when `dex` is set. */
export async function getHyperliquidAccount(address: string, dex?: string): Promise<HyperliquidAccountResult> {
  if (!address || !address.trim()) {
    return { status: "unavailable", reason: "address is required" };
  }
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", reason: "disabled" };
  }

  try {
    const account = await getOrFetch(`hl:account:${address}:${dex ?? "main"}`, ACCOUNT_CACHE_TTL_MS, async () => {
      const fetched = await fetchClearinghouseState(address, dex);
      if (!fetched.ok) {
        throw new Error(fetched.message);
      }

      let accountValue = toNumber(fetched.data.marginSummary.accountValue);
      let withdrawableBalance = toNumber(fetched.data.withdrawable);
      const totalMarginUsed = toNumber(fetched.data.marginSummary.totalMarginUsed);

      // A failed detection/spot lookup falls back to the classic values
      // already computed above rather than failing the whole account
      // view — this override is additive, never the only source of truth.
      const override = dex ? null : await getUnifiedAccountOverride(address);
      if (override) {
        accountValue = override.accountValue;
        withdrawableBalance = override.withdrawableBalance;
      }

      if ([accountValue, withdrawableBalance, totalMarginUsed].some(Number.isNaN)) {
        throw new Error(`Non-numeric account summary fields for ${address}`);
      }

      const positions = fetched.data.assetPositions
        .map((ap) => normalizePosition(ap.position))
        .filter((p): p is HyperliquidPosition => p !== null);

      return {
        accountValue,
        withdrawableBalance,
        totalMarginUsed,
        positions,
        timestamp: Date.now(),
        isUnifiedAccount: override !== null,
      };
    });

    return { status: "ok", account };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Hyperliquid account data unavailable";
    return { status: "unavailable", reason };
  }
}

/** Per Hyperliquid's own docs, "dex" here defaults to the main dex ONLY —
 * unlike userFills, a HIP-3 dex's open orders are never included unless
 * this is explicitly passed. */
export async function getHyperliquidOpenOrders(address: string, dex?: string): Promise<HyperliquidOpenOrdersResult> {
  if (!address || !address.trim()) {
    return { status: "unavailable", reason: "address is required" };
  }
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", reason: "disabled" };
  }

  try {
    const orders = await getOrFetch(`hl:orders:${address}:${dex ?? "main"}`, ACCOUNT_CACHE_TTL_MS, async () => {
      const fetched = await fetchOpenOrders(address, dex);
      if (!fetched.ok) {
        throw new Error(fetched.message);
      }
      const result = [];
      for (const raw of fetched.data) {
        const side = normalizeSide(raw.side);
        const price = toNumber(raw.limitPx);
        const size = toNumber(raw.sz);
        if (!side || Number.isNaN(price) || Number.isNaN(size)) {
          console.error(`[hyperliquid-service] skipping order ${raw.oid}: unparseable field`);
          continue;
        }
        result.push({ coin: raw.coin, side, price, size, orderId: raw.oid, timestamp: raw.timestamp });
      }
      return result;
    });

    return { status: "ok", orders };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Hyperliquid open orders unavailable";
    return { status: "unavailable", reason };
  }
}

export async function getHyperliquidUserFills(address: string, limit = 20): Promise<HyperliquidFillsResult> {
  if (!address || !address.trim()) {
    return { status: "unavailable", reason: "address is required" };
  }
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", reason: "disabled" };
  }

  try {
    const fills = await getOrFetch(`hl:fills:${address}`, ACCOUNT_CACHE_TTL_MS, async () => {
      const fetched = await fetchUserFills(address);
      if (!fetched.ok) {
        throw new Error(fetched.message);
      }
      const result = [];
      for (const raw of fetched.data) {
        const side = normalizeSide(raw.side);
        const price = toNumber(raw.px);
        const size = toNumber(raw.sz);
        const closedPnl = toNumber(raw.closedPnl);
        const fee = toNumber(raw.fee);
        if (!side || [price, size, closedPnl, fee].some(Number.isNaN)) {
          console.error(`[hyperliquid-service] skipping fill ${raw.oid}: unparseable field`);
          continue;
        }
        result.push({ coin: raw.coin, side, price, size, closedPnl, fee, timestamp: raw.time });
      }
      // Newest first.
      return result.sort((a, b) => b.timestamp - a.timestamp);
    });

    return { status: "ok", fills: fills.slice(0, limit) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Hyperliquid trade history unavailable";
    return { status: "unavailable", reason };
  }
}

// --- Order execution (Phase 4) — the server never signs anything and
// never sees a private key; every signature is produced client-side,
// inside the user's own wallet, before submitHyperliquidExchangeAction()
// is ever called. This is a thin validate-then-relay layer: reject before
// ever contacting Hyperliquid when a check fails, otherwise forward the
// caller's `action` object byte-identical (never reconstructed — the
// signature's hash depends on the exact shape/key order that was signed)
// and classify Hyperliquid's real response. Never wrapped in getOrFetch —
// a write must never be cached or deduplicated. ---

const EXCHANGE_ACTION_TYPES: HyperliquidExchangeActionType[] = ["updateLeverage", "order", "approveAgent", "sendAsset"];

function isValidExchangeActionType(value: unknown): value is HyperliquidExchangeActionType {
  return typeof value === "string" && (EXCHANGE_ACTION_TYPES as string[]).includes(value);
}

/** The asset index this action references, for either action type —
 * reads/inspects the action, never reconstructs it. */
function extractAssetIndex(action: Record<string, unknown>): number | null {
  if (action.type === "updateLeverage") {
    return typeof action.asset === "number" ? action.asset : null;
  }
  if (action.type === "order") {
    const orders = action.orders;
    // Phase 4 scope: exactly one order per action, no batch submissions.
    if (!Array.isArray(orders) || orders.length !== 1) return null;
    const a = (orders[0] as Record<string, unknown> | undefined)?.a;
    return typeof a === "number" ? a : null;
  }
  return null;
}

function extractLeverage(action: Record<string, unknown>): number | null {
  return action.type === "updateLeverage" && typeof action.leverage === "number" ? action.leverage : null;
}

/** Notional value (price × size) of a single-order "order" action — the
 * conservative (larger) bound used in place of true margin, since the
 * leverage actually in effect at execution time depends on a prior
 * updateLeverage action this function doesn't re-read from Hyperliquid. */
function extractOrderNotional(action: Record<string, unknown>): number | null {
  if (action.type !== "order") return null;
  const orders = action.orders;
  if (!Array.isArray(orders) || orders.length !== 1) return null;
  const order = orders[0] as Record<string, unknown>;
  const price = Number(order.p);
  const size = Number(order.s);
  return Number.isFinite(price) && Number.isFinite(size) ? price * size : null;
}

/** A reduce-only order can only shrink/close an existing position, never
 * add new exposure — Hyperliquid itself enforces this, so it can never
 * require additional margin. The balance pre-flight check exists purely
 * to protect an OPENING order from being placed against insufficient
 * funds; applying it to a close as well could trap a user in a losing,
 * fully-margined position they can't get out of. */
function isReduceOnlyOrder(action: Record<string, unknown>): boolean {
  if (action.type !== "order") return false;
  const orders = action.orders;
  if (!Array.isArray(orders) || orders.length !== 1) return false;
  return (orders[0] as Record<string, unknown>).r === true;
}

type RawOrderStatus =
  | { resting: { oid: number } }
  | { filled: { totalSz: string; avgPx: string; oid: number } }
  | { error: string }
  | "waitingForFill"
  | "waitingForTrigger";

type RawExchangeResponse = {
  status: "ok" | "err";
  response?: { type: string; data?: { statuses?: RawOrderStatus[] } } | string;
};

/** Classifies Hyperliquid's real /exchange response — never optimistic,
 * never fabricates a fill. `pending` covers updateLeverage's plain "ok"
 * (no per-item statuses) and an order's rare "waitingForFill"/
 * "waitingForTrigger" (Phase 4 only places market orders, so a trigger
 * order should never actually produce that second one in practice). */
function classifyExchangeResponse(raw: unknown): HyperliquidExchangeResult {
  if (!raw || typeof raw !== "object") {
    return { status: "hyperliquid-rejected", message: "Unrecognized response from Hyperliquid" };
  }
  const data = raw as RawExchangeResponse;
  if (data.status !== "ok") {
    const message = typeof data.response === "string" ? data.response : "Hyperliquid rejected the action";
    return { status: "hyperliquid-rejected", message };
  }

  const statuses = typeof data.response === "object" ? data.response?.data?.statuses : undefined;
  if (!statuses || statuses.length === 0) {
    return { status: "pending" };
  }

  const first = statuses[0];
  if (first === "waitingForFill" || first === "waitingForTrigger") {
    return { status: "pending" };
  }
  if ("error" in first) {
    return { status: "hyperliquid-rejected", message: first.error };
  }
  if ("filled" in first) {
    return {
      status: "filled",
      orderId: first.filled.oid,
      totalSize: Number(first.filled.totalSz),
      avgPrice: Number(first.filled.avgPx),
    };
  }
  if ("resting" in first) {
    return { status: "resting", orderId: first.resting.oid };
  }
  return { status: "hyperliquid-rejected", message: "Unrecognized order status from Hyperliquid" };
}

/** Busts the cached account/orders/fills views for `address` (and,
 * separately, `dex`) — called after a real order/leverage/transfer
 * submission reaches Hyperliquid, whatever the outcome. Without this,
 * getHyperliquidAccount's 10s getOrFetch cache could serve pre-trade data
 * to the client-side refresh() call that runs immediately after a trade
 * completes, making a genuinely successful (or ambiguous network-
 * failure) trade look like it never happened for up to that whole 10s
 * window. Never called for a pre-flight rejection (disabled/invalid/
 * insufficient-balance/etc) — those never reach Hyperliquid, so nothing
 * upstream changed. `dex` undefined busts the native/main pool's cache;
 * pass it explicitly for a HIP-3 order, or call this twice (once per
 * side) after a cross-dex sendAsset transfer. */
function invalidateAccountCache(address: string, dex?: string): void {
  invalidate(`hl:account:${address}:${dex ?? "main"}`);
  invalidate(`hl:orders:${address}:${dex ?? "main"}`);
  invalidate(`hl:fills:${address}`); // userFills has no dex scoping — one shared cache entry
}

/** Pure extraction of a sendAsset action's transfer fields — no
 * validation here (see submitHyperliquidExchangeAction for that), just
 * type-narrowing the raw action object. Returns null for a malformed
 * shape so the caller can reject before ever contacting Hyperliquid. */
function extractSendAssetParams(
  action: Record<string, unknown>
): { destination: string; sourceDex: string; destinationDex: string; token: string; amount: string } | null {
  if (action.type !== "sendAsset") return null;
  const { destination, sourceDex, destinationDex, token, amount } = action;
  if (
    typeof destination !== "string" ||
    typeof sourceDex !== "string" ||
    typeof destinationDex !== "string" ||
    typeof token !== "string" ||
    typeof amount !== "string"
  ) {
    return null;
  }
  return { destination, sourceDex, destinationDex, token, amount };
}

export async function submitHyperliquidExchangeAction(
  userId: string,
  address: string,
  action: Record<string, unknown>,
  nonce: number,
  signature: HyperliquidSignature
): Promise<HyperliquidExchangeResult> {
  if (!isHyperliquidEnabled()) {
    return { status: "rejected", reason: "disabled", message: "Hyperliquid trading is disabled" };
  }
  if (!isValidExchangeActionType(action.type)) {
    return { status: "rejected", reason: "unknown-action-type", message: "Unsupported action type" };
  }

  // approveAgent (Phase 5) has no asset/leverage/balance concept at all —
  // it's a one-time delegation grant, not a trade — so it skips every
  // check below and relays straight through.
  if (action.type === "approveAgent") {
    try {
      const result = await postExchange<unknown>({ action, nonce, signature });
      if (!result.ok) {
        return { status: "network-failure", message: result.message };
      }
      return classifyExchangeResponse(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error submitting to Hyperliquid";
      return { status: "network-failure", message };
    }
  }

  // sendAsset (Phase 8) — the collateral transfer that funds/withdraws a
  // HIP-3 dex's isolated margin pool. Not a trade either, but far more
  // narrowly validated than approveAgent: unlike every other action here,
  // its `destination` field can name ANY address, and its `sourceDex`/
  // `destinationDex` are free-form strings Hyperliquid itself accepts
  // for arbitrary dexes — nothing about the shape alone stops a bug in
  // the client from constructing a transfer to the wrong place. The real
  // security boundary is still the wallet's own signature (the user sees
  // and approves the literal payload before signing), but this server
  // still refuses to even relay a payload that isn't exactly the one
  // narrow shape CompassFinance's funding/withdraw UI is meant to
  // produce: to yourself, between the main dex and one of the HIP-3
  // dexes this app actually knows about, moving only the real USDC token.
  if (action.type === "sendAsset") {
    const transfer = extractSendAssetParams(action);
    if (!transfer) {
      return { status: "rejected", reason: "invalid-request", message: "Malformed transfer parameters" };
    }
    if (transfer.destination.toLowerCase() !== address.toLowerCase()) {
      return { status: "rejected", reason: "invalid-transfer", message: "Transfers may only be made to your own address" };
    }
    // "spot" is a real, distinct sendAsset value (@nktkas/hyperliquid's
    // own sendAsset.d.ts: `"" for default USDC perp DEX, "spot" for
    // spot`) — required, not optional, for a Unified Account Mode wallet
    // (real, reproduced: Hyperliquid rejects a plain "" source for one
    // with "Unified account only supports sending assets through spot").
    // See dexPairForDirection's comment in hyperliquid-dex-transfer.ts.
    const configuredDexes = new Set(getConfiguredHip3DexNames());
    const isKnownDex = (d: string) => d === "" || d === "spot" || configuredDexes.has(d);
    if (!isKnownDex(transfer.sourceDex) || !isKnownDex(transfer.destinationDex)) {
      return { status: "rejected", reason: "invalid-transfer", message: "Unknown transfer source or destination" };
    }
    if (transfer.sourceDex === transfer.destinationDex) {
      return { status: "rejected", reason: "invalid-transfer", message: "Source and destination must differ" };
    }
    const usdcTokenId = await getUsdcTokenId();
    if (!usdcTokenId || transfer.token !== usdcTokenId) {
      return { status: "rejected", reason: "invalid-transfer", message: "Only USDC may be transferred" };
    }
    const amount = Number(transfer.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { status: "rejected", reason: "invalid-request", message: "Enter a transfer amount greater than 0" };
    }
    // Fresh, uncached balance check against the SOURCE pool specifically
    // — same UX-courtesy pattern as the order pre-flight check (never the
    // real security boundary; Hyperliquid's own ledger is authoritative
    // and will reject an actually-overdrawn transfer regardless).
    //
    // "spot" isn't a real HIP-3 perp dex clearinghouseState can be
    // queried for — it's sendAsset's own vocabulary for "this account's
    // Unified balance" (see above), which is exactly what
    // getUnifiedAccountOverride already resolves via the real spot
    // clearinghouse. Every other value (""/a HIP-3 dex name) keeps using
    // the classic clearinghouseState check, with the same override this
    // check used to skip (real, reported bug: a Unified Account wallet
    // funding XYZ from its main balance was rejected as insufficient even
    // though the panel showed a real, sufficient balance, because this
    // was the one balance check in the whole integration still reading
    // the stale classic value directly — see getUnifiedAccountOverride's
    // own comment).
    let sourceWithdrawable: number;
    if (transfer.sourceDex === "spot") {
      const spot = await getUnifiedAccountOverride(address);
      if (!spot) {
        return { status: "rejected", reason: "invalid-request", message: "Couldn't verify your balance" };
      }
      sourceWithdrawable = spot.withdrawableBalance;
    } else {
      const sourceDexParam = transfer.sourceDex || undefined;
      const sourceState = await fetchClearinghouseState(address, sourceDexParam);
      if (!sourceState.ok) {
        return { status: "rejected", reason: "invalid-request", message: "Couldn't verify your balance" };
      }
      sourceWithdrawable = toNumber(sourceState.data.withdrawable);
      const sourceOverride = sourceDexParam ? null : await getUnifiedAccountOverride(address);
      if (sourceOverride) {
        sourceWithdrawable = sourceOverride.withdrawableBalance;
      }
    }
    if (!Number.isNaN(sourceWithdrawable) && amount > sourceWithdrawable) {
      return { status: "rejected", reason: "insufficient-balance", message: "Amount exceeds your available balance" };
    }

    // "spot" maps back to the same "main" cache entry getHyperliquidAccount
    // itself uses (dex=undefined) — it was never a real per-dex cache key,
    // just sendAsset's own vocabulary for the main/unified balance (see
    // above). Invalidating "spot" literally would silently miss the
    // account's actual cache entry, leaving the panel showing a stale
    // pre-transfer balance.
    const cacheDexFor = (d: string) => (d === "spot" ? undefined : d || undefined);
    try {
      const result = await postExchange<unknown>({ action, nonce, signature });
      invalidateAccountCache(address, cacheDexFor(transfer.sourceDex));
      invalidateAccountCache(address, cacheDexFor(transfer.destinationDex));
      if (!result.ok) {
        return { status: "network-failure", message: result.message };
      }
      return classifyExchangeResponse(result.data);
    } catch (err) {
      invalidateAccountCache(address, cacheDexFor(transfer.sourceDex));
      invalidateAccountCache(address, cacheDexFor(transfer.destinationDex));
      const message = err instanceof Error ? err.message : "Unexpected error submitting to Hyperliquid";
      return { status: "network-failure", message };
    }
  }

  const assetIndex = extractAssetIndex(action);
  if (assetIndex === null) {
    return { status: "rejected", reason: "invalid-request", message: "Missing or invalid asset reference" };
  }

  const universeResult = await getHyperliquidUniverse();
  if (universeResult.status !== "ok") {
    return { status: "rejected", reason: "invalid-request", message: "Hyperliquid market list unavailable" };
  }
  const asset = universeResult.universe.find((u) => u.index === assetIndex);
  if (!asset || !isTradableHyperliquidCoin(asset.coin)) {
    return { status: "rejected", reason: "unknown-coin", message: "This asset isn't available for trading" };
  }
  // Which margin pool this action's balance check/cache invalidation must
  // use — null for the native/main dex, a HIP-3 dex short name otherwise.
  const dex = getHip3DexName(asset.coin);

  if (action.type === "updateLeverage") {
    const leverage = extractLeverage(action);
    if (leverage === null || leverage < 1) {
      return { status: "rejected", reason: "invalid-request", message: "Invalid leverage" };
    }
    if (leverage > asset.maxLeverage) {
      return {
        status: "rejected",
        reason: "leverage-exceeds-max",
        message: `Leverage exceeds ${asset.coin}'s maximum of ${asset.maxLeverage}x`,
      };
    }
  }

  if (action.type === "order" && !isReduceOnlyOrder(action)) {
    // Phase 7: real trading requires the same education gate Paper
    // Trading's own BUY already enforces (see trading-service.ts) PLUS a
    // completed practice trade of this same asset — see
    // real-trading-access.ts, the one deliberate place this layer reads
    // learning progress. Reduce-only (closing/reducing) orders skip this,
    // same reasoning as the balance check just below: you can always exit
    // a position you already hold, regardless of current unlock state.
    const compassAssetId = getAssetIdForHyperliquidCoin(asset.coin);
    if (!compassAssetId) {
      // Defensive only — asset.coin already passed isTradableHyperliquidCoin
      // above, so this reverse lookup should always resolve.
      return { status: "rejected", reason: "unknown-coin", message: "This asset isn't available for trading" };
    }
    const progress = await getServerLearningProgress(userId);
    if (!isRealTradingUnlocked(compassAssetId, progress)) {
      const name = getAsset(compassAssetId)?.name ?? asset.coin;
      return {
        status: "rejected",
        reason: "real-trading-locked",
        message: `Real trading for ${name} isn't unlocked yet — complete its course, quiz, and a practice trade in Paper Trading first.`,
      };
    }

    const notional = extractOrderNotional(action);
    if (notional === null) {
      return { status: "rejected", reason: "invalid-request", message: "Invalid order parameters" };
    }
    // Fresh, uncached balance check — a write path deserves a tighter
    // staleness bound than getHyperliquidAccount's 10s getOrFetch cache.
    // This is a UX courtesy, not the real security boundary: Hyperliquid's
    // own margin engine is authoritative and will reject an actually-
    // undermargined order regardless of what this check concludes.
    //
    // Phase 8: a HIP-3 asset's margin lives in that dex's own ISOLATED
    // pool — checking the main dex's balance here would be checking the
    // wrong number entirely (verified live: the same address holds a
    // genuinely different balance per dex). Unified Account Mode's
    // spot<->perp override only ever applies to the main dex, so it's
    // skipped for a dex-qualified asset, same reasoning as
    // getHyperliquidAccount.
    const fresh = await fetchClearinghouseState(address, dex ?? undefined);
    if (!fresh.ok) {
      return { status: "rejected", reason: "invalid-request", message: "Couldn't verify account balance" };
    }
    let withdrawable = toNumber(fresh.data.withdrawable);
    const override = dex ? null : await getUnifiedAccountOverride(address);
    if (override) withdrawable = override.withdrawableBalance;
    if (!Number.isNaN(withdrawable) && notional > withdrawable * asset.maxLeverage) {
      return {
        status: "rejected",
        reason: "insufficient-balance",
        message: "Order size exceeds what your balance can support",
      };
    }
  }

  try {
    const result = await postExchange<unknown>({ action, nonce, signature });
    invalidateAccountCache(address, dex ?? undefined);
    if (!result.ok) {
      // Could not confirm Hyperliquid ever received/processed this —
      // never reported as a hard failure, since it may have gone through.
      return { status: "network-failure", message: result.message };
    }
    return classifyExchangeResponse(result.data);
  } catch (err) {
    invalidateAccountCache(address, dex ?? undefined);
    const message = err instanceof Error ? err.message : "Unexpected error submitting to Hyperliquid";
    return { status: "network-failure", message };
  }
}
