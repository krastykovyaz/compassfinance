// The single server-side Hyperliquid adapter for Compass. Everything that
// needs a real Hyperliquid price, candle series, or order book goes
// through the three functions here — nothing else in the codebase should
// import client.ts directly. Mirrors src/server/market/service.ts's shape
// exactly: every function is gated on isHyperliquidEnabled() first (no
// network call at all when disabled), returns a discriminated "ok" |
// "unavailable" result, and NEVER fabricates a substitute value — there is
// no mock Hyperliquid provider anywhere in this codebase, so "disabled" or
// "upstream failed" both mean the same honest "unavailable" to the caller.

import { getOrFetch } from "@/server/market/cache";
import { isHyperliquidEnabled } from "./config";
import {
  fetchMetaAndAssetCtxs,
  fetchCandleSnapshot,
  fetchL2Book,
  fetchClearinghouseState,
  fetchOpenOrders,
  fetchUserFills,
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

/**
 * Live snapshot (price, 24h change/volume, funding) for every Hyperliquid
 * perpetual market, from a single upstream call. A market whose fields
 * don't parse cleanly is skipped (logged) rather than shown with a
 * fabricated number — mirrors yahoo-client.ts's null-candle-skip idiom.
 */
export async function getHyperliquidMarkets(): Promise<HyperliquidMarketsResult> {
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", reason: "disabled" };
  }

  try {
    const markets = await getOrFetch("hl:markets", MARKETS_CACHE_TTL_MS, async () => {
      const fetched = await fetchMetaAndAssetCtxs();
      if (!fetched.ok) {
        // Thrown so getOrFetch does NOT cache the failure.
        throw new Error(fetched.message);
      }
      const [meta, assetCtxs] = fetched.data;

      const result: HyperliquidMarketSnapshot[] = [];
      const timestamp = Date.now();
      for (let i = 0; i < meta.universe.length; i++) {
        const coin = meta.universe[i].name;
        const maxLeverage = meta.universe[i].maxLeverage;
        const ctx = assetCtxs[i];
        const price = toNumber(ctx.markPx);
        const prevDayPx = toNumber(ctx.prevDayPx);
        const volume24h = toNumber(ctx.dayNtlVlm);
        const fundingRate = toNumber(ctx.funding);

        if ([price, prevDayPx, volume24h, fundingRate].some(Number.isNaN) || !Number.isFinite(maxLeverage)) {
          console.error(`[hyperliquid-service] skipping ${coin}: non-numeric field in asset context`);
          continue;
        }

        const change24h = price - prevDayPx;
        const changePercent24h = prevDayPx !== 0 ? (change24h / prevDayPx) * 100 : 0;

        result.push({
          assetId: coin,
          symbol: coin,
          displayName: coin,
          price,
          change24h,
          changePercent24h,
          volume24h,
          fundingRate,
          timestamp,
          maxLeverage,
        });
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

export async function getHyperliquidAccount(address: string): Promise<HyperliquidAccountResult> {
  if (!address || !address.trim()) {
    return { status: "unavailable", reason: "address is required" };
  }
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", reason: "disabled" };
  }

  try {
    const account = await getOrFetch(`hl:account:${address}`, ACCOUNT_CACHE_TTL_MS, async () => {
      const fetched = await fetchClearinghouseState(address);
      if (!fetched.ok) {
        throw new Error(fetched.message);
      }

      const accountValue = toNumber(fetched.data.marginSummary.accountValue);
      const withdrawableBalance = toNumber(fetched.data.withdrawable);
      const totalMarginUsed = toNumber(fetched.data.marginSummary.totalMarginUsed);
      if ([accountValue, withdrawableBalance, totalMarginUsed].some(Number.isNaN)) {
        throw new Error(`Non-numeric account summary fields for ${address}`);
      }

      const positions = fetched.data.assetPositions
        .map((ap) => normalizePosition(ap.position))
        .filter((p): p is HyperliquidPosition => p !== null);

      return { accountValue, withdrawableBalance, totalMarginUsed, positions, timestamp: Date.now() };
    });

    return { status: "ok", account };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Hyperliquid account data unavailable";
    return { status: "unavailable", reason };
  }
}

export async function getHyperliquidOpenOrders(address: string): Promise<HyperliquidOpenOrdersResult> {
  if (!address || !address.trim()) {
    return { status: "unavailable", reason: "address is required" };
  }
  if (!isHyperliquidEnabled()) {
    return { status: "unavailable", reason: "disabled" };
  }

  try {
    const orders = await getOrFetch(`hl:orders:${address}`, ACCOUNT_CACHE_TTL_MS, async () => {
      const fetched = await fetchOpenOrders(address);
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
