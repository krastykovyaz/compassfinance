import { AssetLessonProgress, EMPTY_ASSET_LESSON_PROGRESS, ProgressState, defaultState } from "@/lib/learning/state";
import type { LearningProgress } from "@/lib/learning/types";
import type { RiskProfileId } from "@/lib/risk-profile/risk-profiles";
import { DEFAULT_RISK_PROFILE_ID } from "@/lib/risk-profile/risk-profiles";
import type { InterestCategoryId } from "@/lib/interests/interests";

export type AssetProgressDTO = {
  stepIndex: number;
  lessonCompleted: boolean;
  quizCompleted: boolean;
};

export type MeResponse = {
  user: {
    id: string;
    locale: string | null;
    riskProfileId: string | null;
    onboardingCompleted: boolean;
  };
  interests: InterestCategoryId[];
  favorites: string[];
  notificationPreferences: Record<string, boolean>;
  progress: LearningProgress;
  assetProgress: Record<string, AssetProgressDTO>;
};

/**
 * Builds a `ProgressState`-shaped object purely from server data — this is
 * the crux of Milestone 11.1's architecture: every existing pure function
 * in src/lib/learning/{access,unlocks,progress}.ts reads off `ProgressState`
 * and has no idea whether the data underneath came from localStorage or a
 * database, so once this mapping exists, none of that logic needs to
 * change at all for authenticated users.
 *
 * Practice trading is no longer part of ProgressState at all (Milestone
 * 16: it's a real, server-backed system — see src/lib/trading/ — read
 * through PaperAccountProvider, not this progress snapshot).
 */
export function buildProgressStateFromServer(
  me: MeResponse,
  assetSelectedAnswers: Record<string, Record<string, boolean>>
): ProgressState {
  const assetLessonProgress: Record<string, AssetLessonProgress> = {};
  for (const [assetId, ap] of Object.entries(me.assetProgress)) {
    if (assetId === "sp500") continue; // sp500 uses the top-level fields below
    assetLessonProgress[assetId] = {
      stepIndex: ap.stepIndex,
      lessonCompleted: ap.lessonCompleted,
      quizCompleted: ap.quizCompleted,
      quizAnswers: assetSelectedAnswers[assetId] ?? {},
    };
  }

  const sp500 = me.assetProgress["sp500"] ?? EMPTY_ASSET_LESSON_PROGRESS;

  return {
    ...defaultState,
    xp: me.progress.totalXP,
    lessonStepIndex: sp500.stepIndex,
    lessonCompleted: sp500.lessonCompleted,
    quizAnswers: assetSelectedAnswers["sp500"] ?? {},
    quizCompleted: sp500.quizCompleted,
    achievements: me.progress.unlockedAchievements,
    completedLessons: me.progress.completedLessons,
    quizzesCompletedCount: me.progress.quizzesCompleted,
    correctAnswersCount: me.progress.correctAnswers,
    currentStreak: me.progress.currentStreak,
    longestStreak: me.progress.longestStreak,
    lastActivityAt: me.progress.lastActivityAt,
    assetsExploredSlugs: [], // not needed by any pure derivation fn that reads ProgressState directly
    riskProfileId: (me.user.riskProfileId as RiskProfileId) ?? DEFAULT_RISK_PROFILE_ID,
    assetLessonProgress,
    interests: me.interests,
  };
}
