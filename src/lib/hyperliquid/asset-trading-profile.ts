// Phase 7 (Stocks/Indices/Commodities/Crypto expansion) — the single
// derived view combining CompassFinance's own asset catalog (the source
// of truth for "what assets exist") with asset-mapping.ts (the source of
// truth for "which of those has a real Hyperliquid market") into exactly
// the shape the UI needs per asset: a human-readable name, its category,
// the real underlying/instrument, the internal technical mapping, and
// separate Paper Trading vs. real-trading availability flags.
//
// Deliberately NOT a new registry — every field here is read from
// ASSET_CATALOG or HYPERLIQUID_ASSET_MAP (via asset-mapping.ts's own
// exports), never invented or hardcoded a second time. If either of those
// changes, this file needs no edits at all.

import { ASSET_CATALOG_ORDER, getAsset, type AssetCategory, type AssetId } from "@/lib/assets/catalog";
import { getHyperliquidCoinForAsset, getHip3DexName, getHip3DexFullName } from "./asset-mapping";

export type AssetTradingProfile = {
  assetId: AssetId;
  /** Human-readable display name, e.g. "Bitcoin", "S&P 500" — the ONLY
   * label the primary UI (Markets/Trade/Portfolio) may show. */
  name: string;
  category: AssetCategory;
  /** The real underlying/instrument this asset represents, e.g.
   * "Bitcoin", "S&P 500 Index", "Apple Inc." — for every asset in this
   * catalog today that's the same string as `name` (no ETF/proxy
   * substitution anywhere), kept as its own field since it's the thing an
   * expandable Details view is meant to name explicitly. */
  underlying: string;
  /** Technical Hyperliquid coin symbol (e.g. "BTC", "xyz:AAPL"), or null
   * when no verified Hyperliquid perpetual market exists for this asset.
   * Hidden from every primary UI surface — shown only inside expandable
   * Details (see AssetDetailsPanel), never as a primary label. */
  hyperliquidCoin: string | null;
  /** "native" for the standard/main Hyperliquid dex (btc/eth), "hip3" for
   * a builder-deployed dex (e.g. "xyz"'s stocks/gold/oil/SP500), null
   * when realTradingAvailable is false. Drives the Details panel's
   * oracle-tracking disclosure — only shown for "hip3". */
  venue: "native" | "hip3" | null;
  /** HIP-3 dex short name ("xyz"), null for native or unavailable. */
  dex: string | null;
  /** The dex's own display name ("XYZ"), null for native or unavailable —
   * the Details panel's "Oracle/deployer" row. */
  dexFullName: string | null;
  /** Every approved catalog asset may be explored and used in Paper
   * Trading — always true. Kept as an explicit field (rather than assumed)
   * so callers state the requirement instead of relying on an absence of
   * a check. */
  paperTradingAvailable: true;
  /** True only when a verified Hyperliquid perpetual market exists — real
   * trading is never available for an asset without one, no matter what
   * education/practice-trade progress the user has (see
   * real-trading-access.ts, which layers the education gate on top of
   * this same boolean). */
  realTradingAvailable: boolean;
};

export function getAssetTradingProfile(assetId: string): AssetTradingProfile | null {
  const asset = getAsset(assetId);
  if (!asset) return null;
  const hyperliquidCoin = getHyperliquidCoinForAsset(asset.id);
  const dex = hyperliquidCoin ? getHip3DexName(hyperliquidCoin) : null;
  return {
    assetId: asset.id,
    name: asset.name,
    category: asset.category,
    underlying: asset.name,
    hyperliquidCoin,
    venue: hyperliquidCoin ? (dex ? "hip3" : "native") : null,
    dex,
    dexFullName: dex ? getHip3DexFullName(dex) : null,
    paperTradingAvailable: true,
    realTradingAvailable: hyperliquidCoin !== null,
  };
}

/** Every approved asset's trading profile, in the catalog's own display
 * order — the exact "trading universe by category" this phase's audit
 * produces, derived live rather than hand-maintained as a separate list. */
export function getAllAssetTradingProfiles(): AssetTradingProfile[] {
  return ASSET_CATALOG_ORDER.map((id) => getAssetTradingProfile(id)).filter(
    (p): p is AssetTradingProfile => p !== null
  );
}
