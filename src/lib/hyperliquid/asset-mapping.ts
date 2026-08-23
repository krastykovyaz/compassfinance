// The ONLY place that connects an existing catalog asset to a Hyperliquid
// coin — the single source of truth every "is this tradeable" check
// (Markets page filtering, the trading page's routing, order submission's
// coin allowlist) must derive from, rather than each keeping its own
// hardcoded copy. Deliberately a small, explicit, hand-authored map rather
// than a name-matching heuristic.
//
// Phase 8 (verified live, mainnet AND testnet, against BOTH the standard
// /info universe AND every builder-deployed HIP-3 perp dex via
// {"type":"perpDexs"} — not assumed): of Compass's 13 catalog assets, 12
// now have a real, liquid Hyperliquid market. btc/eth trade on the
// standard/native dex. sp500, aapl, nvda, tsla, msft, amzn, googl, meta,
// gold, and brent-oil trade on "xyz" — a builder-deployed (HIP-3) perp dex
// (deployer 0x8880…f0888, fullName "XYZ") that was the ONLY candidate dex
// among several offering the same tickers (flx, km/mkts, cash, abcd) with
// any real trading activity at all — every other candidate showed exactly
// $0 day volume and $0 open interest on every matching market, disqualifying
// them regardless of naming. "xyz" markets showed millions/day in real
// volume and substantial open interest on every one of these 10 (verified
// per-market, see the Phase 8 audit table).
//
// nasdaq is deliberately left UNMAPPED: no dex (including xyz) has a
// literal NASDAQ/NDX/US100-named market with any real liquidity. xyz:XYZ100
// exists but is the dex's own branded "100" basket, not verifiably the
// Nasdaq-100 index — mapping it would be exactly the kind of unrelated-
// token substitution this file exists to prevent. nasdaq stays real-
// trading-unavailable (simulated/practice investing only) until a
// genuine, liquid match is found.
//
// IMPORTANT — HIP-3 is NOT the same trust category as the native dex.
// Confirmed directly against Hyperliquid's own HIP-3 docs: the DEPLOYER
// (here, "xyz") sets its own oracle prices — there is no independent,
// validator-run oracle backing these markets the way BTC/ETH have. Every
// xyz-mapped asset's Details panel must disclose this plainly ("oracle-
// referenced perpetual, not direct ownership of the underlying") — see
// asset-trading-profile.ts and AssetDetailsPanel. HIP-3 dexes also hold
// their OWN isolated margin/collateral pool, separate from the main dex's
// balance — verified live (same address showed a genuinely different
// accountValue with dex:"xyz" vs without it) — see
// hyperliquid-account-provider.tsx's per-dex account fetching and
// hyperliquid-dex-transfer.ts for moving collateral between pools.
//
// Two near-misses from the standard dex were already, and remain,
// deliberately NOT mapped: Hyperliquid's native "SPX" is SPX6900, an
// unrelated meme coin; native "PAXG" is a gold-backed token, not gold.
// If any of this changes, or the catalog gains an asset with a real
// market, this is the one place to add it — everything downstream
// (Markets filtering, the trading page gate, order submission) already
// derives from this map and needs no other change.
import type { AssetId } from "@/lib/assets/catalog";

// Values are the EXACT coin identifier Hyperliquid itself uses — a bare
// symbol ("BTC") for the native dex, or "<dex>:<symbol>" ("xyz:AAPL") for
// a builder-deployed dex. This is the same string Hyperliquid's meta/
// l2Book/candleSnapshot endpoints all key by, so it's used as-is
// everywhere a "coin" parameter is needed — no separate un-prefixing step.
const HYPERLIQUID_ASSET_MAP: Partial<Record<AssetId, string>> = {
  btc: "BTC",
  eth: "ETH",
  sp500: "xyz:SP500",
  aapl: "xyz:AAPL",
  nvda: "xyz:NVDA",
  tsla: "xyz:TSLA",
  msft: "xyz:MSFT",
  amzn: "xyz:AMZN",
  googl: "xyz:GOOGL",
  meta: "xyz:META",
  gold: "xyz:GOLD",
  "brent-oil": "xyz:BRENTOIL",
};

// Static, low-churn branding info for each configured HIP-3 dex — not
// live market data, so not worth a network round-trip to render a Details
// panel row. Update alongside HYPERLIQUID_ASSET_MAP if a new dex is added.
const HIP3_DEX_FULL_NAMES: Record<string, string> = {
  xyz: "XYZ",
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
 * Hyperliquid's full multi-hundred-market universe (native + every HIP-3
 * dex) down to only approved assets instead of leaking all of it. */
export function getAssetIdForHyperliquidCoin(coin: string): AssetId | null {
  for (const [assetId, mappedCoin] of Object.entries(HYPERLIQUID_ASSET_MAP)) {
    if (mappedCoin === coin) return assetId as AssetId;
  }
  return null;
}

/** True for a builder-deployed (HIP-3) coin identifier ("xyz:AAPL"),
 * false for a native/main-dex one ("BTC") — the prefix-before-colon
 * convention Hyperliquid itself uses everywhere a dex-qualified coin
 * name appears. */
export function isHip3Coin(coin: string): boolean {
  return coin.includes(":");
}

/** The HIP-3 dex short name a coin trades on ("xyz" for "xyz:AAPL"), or
 * null for a native/main-dex coin. */
export function getHip3DexName(coin: string): string | null {
  const i = coin.indexOf(":");
  return i === -1 ? null : coin.slice(0, i);
}

/** The dex's own display/branding name ("XYZ" for "xyz") — static
 * registry info, not live market data. Null for an unconfigured or
 * native coin. */
export function getHip3DexFullName(dexName: string): string | null {
  return HIP3_DEX_FULL_NAMES[dexName] ?? null;
}

/** Every distinct HIP-3 dex short name this app is actually configured to
 * fetch/trade against, derived from the map above rather than hardcoded a
 * second time anywhere else — market discovery (markets.ts) and account
 * fetching both iterate this instead of an independently-maintained list,
 * so a coin can never end up mapped without its dex ever being queried. */
export function getConfiguredHip3DexNames(): string[] {
  const names = new Set<string>();
  for (const coin of Object.values(HYPERLIQUID_ASSET_MAP)) {
    const dex = getHip3DexName(coin);
    if (dex) names.add(dex);
  }
  return Array.from(names);
}
