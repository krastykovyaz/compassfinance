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
