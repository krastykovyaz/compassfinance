import { GATED_ASSET_IDS } from "@/lib/learning/unlocks";

/**
 * True only when this asset is actually locked for investing. Thin
 * wrapper around the caller's own useProgress().isInvestmentUnlocked —
 * isInvestmentUnlocked() already correctly resolves UNLOCKED for every
 * asset outside the 5-stage gating ladder (see unlocks.ts's
 * getInvestmentAccess), so this no longer needs its own separate
 * GATED_ASSET_IDS check to arrive at the same answer a second way — it
 * used to, which was exactly the kind of duplicated gating logic that let
 * this file and asset/[slug]/page.tsx's old local GATED_SLUGS drift as
 * two different lists computing the same thing.
 */
export function isAssetLocked(assetId: string, isUnlocked: (assetId: string) => boolean): boolean {
  return !isUnlocked(assetId);
}

// Re-exported for callers that still want to know specifically whether an
// asset is part of the 5-stage ladder (e.g. to show "which course
// unlocks this" copy) — a different question from "is it locked right
// now", which isAssetLocked above answers on its own.
export { GATED_ASSET_IDS };
