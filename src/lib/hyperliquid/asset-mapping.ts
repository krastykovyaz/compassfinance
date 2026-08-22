// The ONLY place that connects an existing catalog asset to a Hyperliquid
// coin. Deliberately a small, explicit, hand-authored map rather than a
// name-matching heuristic — of Compass's 13 catalog assets, only btc and
// eth have a natural Hyperliquid perpetual counterpart; everything else
// (sp500, individual stocks, gold, brent-oil) has no Hyperliquid market at
// all, and must keep its existing Yahoo-sourced chart behavior untouched.

import type { AssetId } from "@/lib/assets/catalog";

const HYPERLIQUID_ASSET_MAP: Partial<Record<AssetId, string>> = {
  btc: "BTC",
  eth: "ETH",
};

export function getHyperliquidCoinForAsset(assetId: string): string | null {
  return HYPERLIQUID_ASSET_MAP[assetId as AssetId] ?? null;
}

/** The coin allowlist for real order submission (Phase 4) — derived from
 * this same map rather than a second hardcoded list, so adding a third
 * tradable asset later only ever means touching this one file. */
export function isTradableHyperliquidCoin(coin: string): boolean {
  return Object.values(HYPERLIQUID_ASSET_MAP).includes(coin);
}
