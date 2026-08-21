// Learning access: "can the user study this asset?" — deliberately
// independent of investment access ("can the user invest in this asset?",
// see unlocks.ts). Milestone 8.1 exists specifically to make sure these
// two questions have two different answers, computed by two different
// functions, instead of the investment-unlock LOCKED status silently also
// blocking the lesson content itself (which is what /learn/[assetId]/page.tsx
// did before this milestone — see its diff).
//
// Rule of thumb used throughout this app: learning access depends ONLY on
// whether lesson content exists for the asset, and how far the user has
// gotten through it. It never depends on unlock requirements, achievements,
// XP, or any other asset's status.

import { getAssetLearningPath } from "./content";
import { EMPTY_ASSET_LESSON_PROGRESS, ProgressState } from "./state";

export type LearningAccessStatus = "NOT_AVAILABLE" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";

export type LearningAccessInput = {
  hasStarted: boolean;
  lessonCompleted: boolean;
  quizCompleted: boolean;
};

export const NOT_STARTED_LEARNING_ACCESS_INPUT: LearningAccessInput = {
  hasStarted: false,
  lessonCompleted: false,
  quizCompleted: false,
};

/**
 * NOT_AVAILABLE — no lesson content exists for this assetId at all.
 * AVAILABLE     — content exists, nothing started yet.
 * IN_PROGRESS   — lesson started, or lesson done but quiz isn't.
 * COMPLETED     — both the lesson and its quiz are done.
 *
 * `input` is null when the caller has no progress record at all for this
 * asset yet (equivalent to NOT_STARTED_LEARNING_ACCESS_INPUT).
 */
export function getLearningAccess(
  assetId: string,
  input: LearningAccessInput | null
): LearningAccessStatus {
  const hasContent = getAssetLearningPath(assetId) !== undefined;
  if (!hasContent) return "NOT_AVAILABLE";

  const i = input ?? NOT_STARTED_LEARNING_ACCESS_INPUT;
  if (i.lessonCompleted && i.quizCompleted) return "COMPLETED";
  if (i.hasStarted || i.lessonCompleted) return "IN_PROGRESS";
  return "AVAILABLE";
}

export function isLearningAvailable(assetId: string): boolean {
  return getLearningAccess(assetId, null) !== "NOT_AVAILABLE";
}

/**
 * Builds the LearningAccessInput for a given asset directly off the
 * persisted ProgressState — S&P 500 keeps its own dedicated top-level
 * fields (lessonStepIndex/lessonCompleted/quizAnswers/quizCompleted, from
 * before Milestone 7's generic lesson engine existed); every other asset
 * reads from `assetLessonProgress[assetId]`. Centralized here so
 * progress-store.tsx doesn't need to know about that sp500 special case.
 */
export function getLearningAccessInput(state: ProgressState, assetId: string): LearningAccessInput {
  if (assetId === "sp500") {
    return {
      hasStarted: state.lessonStepIndex > 0 || Object.keys(state.quizAnswers).length > 0,
      lessonCompleted: state.lessonCompleted,
      quizCompleted: state.quizCompleted,
    };
  }
  const ap = state.assetLessonProgress[assetId] ?? EMPTY_ASSET_LESSON_PROGRESS;
  return {
    hasStarted: ap.stepIndex > 0 || Object.keys(ap.quizAnswers).length > 0,
    lessonCompleted: ap.lessonCompleted,
    quizCompleted: ap.quizCompleted,
  };
}

/** Convenience wrapper combining getLearningAccessInput + getLearningAccess. */
export function getAssetLearningAccess(state: ProgressState, assetId: string): LearningAccessStatus {
  return getLearningAccess(assetId, getLearningAccessInput(state, assetId));
}
