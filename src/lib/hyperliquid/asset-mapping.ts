// The ONLY place that connects an existing catalog asset to a Hyperliquid
// coin — the single source of truth every "is this tradeable" check
// (Markets page filtering, the trading page's routing, order submission's
// coin allowlist) must derive from, rather than each keeping its own
// hardcoded copy. Deliberately a small, explicit, hand-authored map rather
// than a name-matching heuristic.
//
// Phase 7 audit (verified directly against Hyperliquid's real /info meta
// endpoint, both mainnet and testnet — not assumed): of Compass's 13
// catalog assets, only btc and eth have a genuine Hyperliquid perpetual
// counterpart. Hyperliquid's perpetuals are crypto-native; there is no
// equity, index, or commodity-future market for aapl/nvda/tsla/msft/amzn/
// googl/sp500/nasdaq/brent-oil. Two near-misses were deliberately NOT
// mapped: Hyperliquid lists a coin literally named "SPX", but it's
// SPX6900, an unrelated meme coin that only shares a ticker with the S&P
// 500 — mapping sp500 to it would silently put a user's index trade into
// a random meme coin. Hyperliquid also lists "PAXG" (a gold-backed crypto
// token traded as a perpetual, tracking gold price closely but not
// literally gold, with its own funding-rate/basis dynamics) — left
// unmapped per an explicit product decision, not an oversight. If either
// of those changes, or the CompassFinance catalog gains an asset with a
// real Hyperliquid market, this is the one place to add it — everything
// downstream (Markets filtering, the trading page gate, order submission)
// already derives from this map and needs no other change.
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

/** Every CompassFinance asset id with a real Hyperliquid perpetual
 * mapping — the one list the trading page's routing gate and the Markets
 * page's filtering both derive from, so they can never drift apart. */
export function getTradeableAssetIds(): AssetId[] {
  return Object.keys(HYPERLIQUID_ASSET_MAP) as AssetId[];
}

export function isTradeableAssetId(assetId: string): assetId is AssetId {
  return Object.prototype.hasOwnProperty.call(HYPERLIQUID_ASSET_MAP, assetId);
}

/** Reverse lookup: which CompassFinance asset id (if any) a raw
 * Hyperliquid coin symbol belongs to. Returns null for every Hyperliquid
 * market that isn't one of ours — the one place that decides whether a
 * given Hyperliquid market is even ours to show, so Markets can filter
 * Hyperliquid's full ~200-coin universe down to only approved assets
 * instead of leaking all of it. */
export function getAssetIdForHyperliquidCoin(coin: string): AssetId | null {
  for (const [assetId, mappedCoin] of Object.entries(HYPERLIQUID_ASSET_MAP)) {
    if (mappedCoin === coin) return assetId as AssetId;
  }
  return null;
}
