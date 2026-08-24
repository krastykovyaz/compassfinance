// Typed data model for the Compass learning-progress / unlock system.
// Pure types only — no React, no persistence, no UI here.

import { AssetContentCategory } from "./content/types";

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type LearningProgress = {
  totalXP: number;
  level: number;
  lessonsCompleted: number;
  quizzesCompleted: number;
  correctAnswers: number;
  currentStreak: number;
  longestStreak: number;
  assetsExplored: number;
  investmentsMade: number;
  /** Count of DISTINCT assetIds ever traded — what the "Diversified"
   * achievement actually needs (3 trades of the same asset is 1, not 3).
   * Just practiceTradedAssetIds.length — see achievements.ts's
   * DIVERSIFIED and learning-repository.ts's getPracticeTradedAssetIds
   * for the real, persisted source. */
  distinctAssetsInvested: number;
  unlockedAchievements: string[];
  completedLessons: string[];
  /** assetIds whose quiz has been submitted at least once (pass or fail —
   * matches AssetProgressDTO's existing "quizCompleted" meaning, i.e. an
   * attempt, not a passing score). See unlocks.ts's getInvestmentAccess:
   * investment access requires BOTH this and completedLessons, since
   * finishing the lesson READING is not the same as finishing the course. */
  completedQuizzes: string[];
  /** assetIds the user has made at least one Paper Trade of (BUY or SELL),
   * ever — the "has this learner actually practiced trading this specific
   * asset" signal. Distinct from `distinctAssetsInvested` (a count, used
   * only by the DIVERSIFIED achievement): this is the per-asset membership
   * list a real-trading gate can check `.includes(assetId)` against. See
   * learning-repository.ts's getPracticeTradedAssetIds for the real,
   * persisted source. */
  practiceTradedAssetIds: string[];
  lastActivityAt: string | null; // ISO timestamp, null before any activity
};

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export type AchievementId =
  | "FIRST_LESSON"
  | "FIRST_QUIZ"
  | "FIRST_INVESTMENT"
  | "MARKET_BASICS"
  | "INDEX_EXPLORER"
  | "STOCK_EXPLORER"
  | "DIVERSIFIED"
  | "SEVEN_DAY_STREAK";

export type AchievementIconName =
  | "footprints"
  | "help-circle"
  | "trending-up"
  | "landmark"
  | "line-chart"
  | "building-2"
  | "layers"
  | "flame";

export type AchievementDefinition = {
  id: AchievementId;
  title: string;
  description: string;
  icon: AchievementIconName;
  xpReward: number;
  /** Pure predicate — no side effects. Evaluated against current progress. */
  isUnlocked: (progress: LearningProgress) => boolean;
};

// ---------------------------------------------------------------------------
// Investment access (Milestone 8.1: renamed from the earlier, more
// ambiguous "asset unlock" naming — see unlocks.ts's header comment for
// the full rationale. This describes ONLY whether the user may invest;
// see learning/access.ts's LearningAccessStatus for the separate question
// of whether they may study the asset.)
// ---------------------------------------------------------------------------

// Milestone 8: reuse the content registry's category type instead of
// keeping a second, narrower one here. AssetContentCategory already covers
// all four asset categories (index/stock/commodity/crypto), so an
// InvestmentUnlockDefinition can describe a commodity/crypto stage too if
// one is ever added.
export type AssetCategory = AssetContentCategory;

export type InvestmentAccessStatus = "LOCKED" | "AVAILABLE" | "UNLOCKED";

export type InvestmentUnlockDefinition = {
  /** Matches the slug used elsewhere in the app (mock-data MarketAsset.slug,
   * and learning/content's AssetLearningPath.assetId). */
  assetId: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  /** Identifier for the lesson that must be completed to reach UNLOCKED —
   * matches a key in learning/content's ALL_ASSET_LEARNING_PATHS. Note this
   * only gates INVESTMENT access; the lesson itself is always reachable
   * regardless of this stage's status (see learning/access.ts). */
  requiredLessonId: string;
  requiredLessonTopic: string;
  requiredAchievementId?: AchievementId;
  /** Optional minimum total XP required, in addition to the lesson (and
   * achievement, if any). Unset means no XP floor beyond what the lesson
   * itself grants. */
  requiredXP?: number;
  /**
   * The assetId that must itself be UNLOCKED (for investment) before this
   * one can become AVAILABLE. Undefined means this is an entry point
   * (nothing gates it).
   */
  prerequisiteAssetId?: string;
  unlockDescription: string;
  /** Display/ordering position in the investment-unlock ladder, 1-indexed.
   * Purely presentational — gating itself is driven by
   * prerequisiteAssetId, not this number. */
  stage: number;
};
