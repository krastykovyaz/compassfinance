"use client";

// Composing hook behind PriceChart: for the two catalog assets that have
// a real Hyperliquid perpetual counterpart (btc, eth — see
// src/lib/hyperliquid/asset-mapping.ts), sources candles from Hyperliquid
// instead of Yahoo when the feature is enabled; every other asset's chart
// is byte-for-byte unchanged (useAssetCandles, untouched). This is the
// ONLY place that decision is made — PriceChart itself just calls this
// instead of useAssetCandles and needs no other change, since both hooks
// return the identical UseAssetCandlesResult shape.
//
// If Hyperliquid is enabled but transiently down (not just disabled),
// this does NOT fall back to Yahoo — showing "unavailable" is preferable
// to silently swapping the displayed price venue mid-session with no
// indication to the user. Only "disabled" falls back, so turning the
// feature off is a true no-op for every existing asset's chart.

import { useAssetCandles, type UseAssetCandlesResult } from "./use-asset-candles";
import { useHyperliquidCandles } from "@/lib/hyperliquid/use-hyperliquid-candles";
import { getHyperliquidCoinForAsset } from "@/lib/hyperliquid/asset-mapping";
import type { ChartRange, MarketSymbol } from "./market-types";

export function usePriceChartCandles(slug: MarketSymbol, range: ChartRange): UseAssetCandlesResult {
  const hlCoin = getHyperliquidCoinForAsset(slug);

  // Both hooks are always called, unconditionally, to satisfy the Rules
  // of Hooks — useHyperliquidCandles itself no-ops (status "inactive")
  // without fetching when hlCoin is null.
  const yahoo = useAssetCandles(slug, range);
  const hl = useHyperliquidCandles(hlCoin, range);

  if (!hlCoin) return yahoo; // no Hyperliquid market for this asset at all
  if (hl.status === "unavailable" && hl.reason === "disabled") return yahoo; // feature off -> old behavior
  if (hl.status === "inactive") return { candles: [], status: "loading", reason: null, refresh: hl.refresh };
  return { candles: hl.candles, status: hl.status, reason: hl.reason, refresh: hl.refresh };
}
