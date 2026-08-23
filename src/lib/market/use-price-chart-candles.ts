"use client";

// Composing hook behind PriceChart. `preferHyperliquid` is an explicit,
// PAGE-scoped opt-in (only src/app/hyperliquid/[coin]/page.tsx passes it)
// — NOT automatic just because an asset has a Hyperliquid mapping. Real
// bug this fixes (2026-08-23): before this was opt-in, ANY asset with a
// Hyperliquid mapping had its chart switched to Hyperliquid data on EVERY
// page that renders it, including the Paper Trading asset page — which
// broke the moment Phase 8 mapped 10 more assets, since (a) a HIP-3
// market can be delisted on one network while live on another (verified:
// xyz:SP500 has zero candle history on testnet, live on mainnet) with no
// Yahoo fallback available at all, and (b) a HIP-3 price is a synthetic
// oracle-tracked instrument, not the literal underlying — an appropriate
// reference price on the Hyperliquid TRADING page itself, but not
// something Paper Trading's chart should silently start using instead of
// the real S&P 500/stock/commodity price Yahoo already provides. Every
// other asset's chart, and Paper Trading's chart for every asset
// (including btc/eth), is byte-for-byte unchanged — this is the ONLY
// place that decision is made.
//
// If Hyperliquid is enabled but transiently down (not just disabled),
// this does NOT fall back to Yahoo — showing "unavailable" is preferable
// to silently swapping the displayed price venue mid-session with no
// indication to the user. Only "disabled" falls back, so turning the
// feature off is a true no-op.

import { useAssetCandles, type UseAssetCandlesResult } from "./use-asset-candles";
import { useHyperliquidCandles } from "@/lib/hyperliquid/use-hyperliquid-candles";
import { getHyperliquidCoinForAsset } from "@/lib/hyperliquid/asset-mapping";
import type { ChartRange, MarketSymbol } from "./market-types";

export function usePriceChartCandles(
  slug: MarketSymbol,
  range: ChartRange,
  preferHyperliquid = false
): UseAssetCandlesResult {
  const hlCoin = preferHyperliquid ? getHyperliquidCoinForAsset(slug) : null;

  // Both hooks are always called, unconditionally, to satisfy the Rules
  // of Hooks — useHyperliquidCandles itself no-ops (status "inactive")
  // without fetching when hlCoin is null (either no mapping, or this
  // call site never opted in).
  const yahoo = useAssetCandles(slug, range);
  const hl = useHyperliquidCandles(hlCoin, range);

  if (!hlCoin) return yahoo; // not opted in, or no Hyperliquid market for this asset at all
  if (hl.status === "unavailable" && hl.reason === "disabled") return yahoo; // feature off -> old behavior
  if (hl.status === "inactive") return { candles: [], status: "loading", reason: null, refresh: hl.refresh };
  return { candles: hl.candles, status: hl.status, reason: hl.reason, refresh: hl.refresh };
}
