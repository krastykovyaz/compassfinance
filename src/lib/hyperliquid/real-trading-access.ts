// Phase 7 — the ONE deliberate coupling point between the Hyperliquid
// real-trading layer and the learning/investment-unlock system. Every
// other file under src/lib/hyperliquid, src/server/hyperliquid, and
// src/components/hyperliquid stays free of @/lib/learning imports (see
// no-unlock-coupling.test.ts's guardrail, updated alongside this file to
// assert exactly that — a narrow, explicit exception, not a removed
// invariant).
//
// Real trading requires THREE things, in order, mirroring the product
// spec verbatim:
//   1. required courses    — progress.completedLessons
//   2. required quiz       — progress.completedQuizzes
//   (1 + 2 together are exactly what getInvestmentAccess/
//   isInvestmentUnlocked from learning/unlocks.ts already decide — the
//   same gate that unlocks Paper Trading BUY for this asset, reused
//   as-is, not recomputed a second way.)
//   3. a successful practice/paper trade of THIS asset —
//   progress.practiceTradedAssetIds, a new field alongside completedLessons/
//   completedQuizzes, populated the same way (see learning-repository.ts's
//   getPracticeTradedAssetIds).
//
// Also requires a verified Hyperliquid market to exist at all — no amount
// of education/practice unlocks real trading for an asset Hyperliquid
// simply doesn't list (see asset-mapping.ts's audit).
//
// Paper Trading itself never calls this — placePaperTrade's own BUY gate
// (trading-service.ts) is untouched and still only checks
// isInvestmentUnlocked, so Paper Trading availability is completely
// independent of real-trading eligibility, exactly as required.

import { isInvestmentUnlocked } from "@/lib/learning/unlocks";
import type { LearningProgress } from "@/lib/learning/types";
import { isTradeableAssetId } from "./asset-mapping";

export type RealTradingAccessStatus =
  | "LOCKED_NO_MARKET" // no verified Hyperliquid mapping exists for this asset at all
  | "LOCKED_EDUCATION" // required course + quiz (isInvestmentUnlocked) not yet complete
  | "LOCKED_NO_PRACTICE_TRADE" // education done, but no Paper Trade of this asset yet
  | "UNLOCKED";

export function getRealTradingAccess(assetId: string, progress: LearningProgress): RealTradingAccessStatus {
  if (!isTradeableAssetId(assetId)) return "LOCKED_NO_MARKET";
  if (!isInvestmentUnlocked(assetId, progress)) return "LOCKED_EDUCATION";
  if (!progress.practiceTradedAssetIds.includes(assetId)) return "LOCKED_NO_PRACTICE_TRADE";
  return "UNLOCKED";
}

export function isRealTradingUnlocked(assetId: string, progress: LearningProgress): boolean {
  return getRealTradingAccess(assetId, progress) === "UNLOCKED";
}
