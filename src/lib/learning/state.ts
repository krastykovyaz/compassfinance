// The canonical, persisted learning/progress state shape for the whole
// app — Milestone 8, section 2 ("one source of truth"). No React, no
// localStorage code here; progress-store.tsx (the React provider) owns
// hydration/persistence, and src/lib/learning/reducer.ts (pure functions)
// owns every state transition. This file only owns the shape and its
// default value, so both of those can import the same thing instead of
// each keeping their own copy.

import { DEFAULT_RISK_PROFILE_ID, RiskProfileId } from "@/lib/risk-profile/risk-profiles";
import { InterestCategoryId } from "@/lib/interests/interests";

/**
 * Generic per-asset lesson/quiz progress — Milestone 7. Deliberately
 * separate from the sp500-specific `lessonStepIndex` / `lessonCompleted` /
 * `quizAnswers` / `quizCompleted` fields below, which stay untouched and
 * keep driving the original /learn/indices/sp500 page exactly as before.
 * Every OTHER asset's lesson engine (/learn/[assetId]) reads/writes here
 * instead, keyed by assetId, so existing localStorage progress for S&P 500
 * round-trips unchanged.
 */
export type AssetLessonProgress = {
  stepIndex: number; // how many lesson steps have been read
  lessonCompleted: boolean;
  quizAnswers: Record<string, boolean>; // questionId -> correct
  quizCompleted: boolean;
};

export const EMPTY_ASSET_LESSON_PROGRESS: AssetLessonProgress = {
  stepIndex: 0,
  lessonCompleted: false,
  quizAnswers: {},
  quizCompleted: false,
};

// Milestone 16: `openPosition`/`closedPositions` (the old sp500-only,
// fixed-$10-stake practice-trade fields) were removed from this shape
// entirely — paper trading is now a real, multi-asset, quantity-based
// system backed by the database (see src/lib/trading/), not local
// progress state. Same "no destructive migration needed" note as the
// unlockedAssets removal above: progress-store.tsx merges
// `{ ...defaultState, ...parsed }` on hydration, so old localStorage
// blobs that still carry these keys just carry them as unused extra
// properties nothing reads anymore.

export type ProgressState = {
  xp: number;
  lessonStepIndex: number; // how many lesson steps have been read (0-5)
  lessonCompleted: boolean;
  quizAnswers: Record<string, boolean>; // questionId -> correct
  quizCompleted: boolean;
  achievements: string[]; // canonical AchievementId strings (see learning/types.ts)

  // --- Added for the learning-progress/unlock foundation ---
  completedLessons: string[]; // lesson ids, e.g. "sp500"
  quizzesCompletedCount: number;
  correctAnswersCount: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: string | null; // ISO timestamp
  assetsExploredSlugs: string[]; // asset detail pages the user has viewed

  // Risk appetite only — not ESG/ethical-investing preferences, and not
  // used to gate asset unlocks (see src/lib/learning/unlocks.ts for that).
  riskProfileId: RiskProfileId;

  // --- Added for Milestone 7's generic multi-asset lesson engine ---
  // Keyed by assetId (e.g. "nasdaq", "aapl", "gold", "btc"...). Never used
  // for "sp500" — see the note on AssetLessonProgress above.
  assetLessonProgress: Record<string, AssetLessonProgress>;

  // --- Added for Milestone 9's Investor Interests (Part 4) ---
  // Deliberately separate from riskProfileId above — see
  // src/lib/interests/interests.ts's header comment. What the user wants
  // to follow/learn about, never used to gate anything or derive risk
  // appetite.
  interests: InterestCategoryId[];
};

export const STORAGE_KEY = "compass-progress-v1";

// Milestone 8.1: `unlockedAssets` (an array of investment-unlocked slugs,
// mutated directly by the old practice-trading flow) was removed from this
// shape entirely — investment access is derived purely from
// completedLessons/achievements/xp via learning/unlocks.ts now, so keeping
// a stored copy around risked it silently drifting out of sync again.
// Nothing here needs to migrate old localStorage data: progress-store.tsx
// merges `{ ...defaultState, ...parsed }` on hydration, so a pre-8.1 blob
// that still has an `unlockedAssets` key just carries it as an unused,
// never-read extra property — every other field (xp, completedLessons,
// achievements, etc.) round-trips exactly as before. No reset, no
// destructive migration needed.
export const defaultState: ProgressState = {
  // Milestone 19: this used to be baseUser.xp (mock-data's user.xp,
  // 1250) — meaning every brand-new anonymous learner silently started
  // with 1250 XP already. A new learner genuinely starts at 0.
  xp: 0,
  lessonStepIndex: 0,
  lessonCompleted: false,
  quizAnswers: {},
  quizCompleted: false,
  achievements: [],

  completedLessons: [],
  quizzesCompletedCount: 0,
  correctAnswersCount: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastActivityAt: null,
  assetsExploredSlugs: [],

  riskProfileId: DEFAULT_RISK_PROFILE_ID,

  assetLessonProgress: {},

  // Safe default for a field newly introduced this milestone — see Part 6:
  // old localStorage blobs that predate this key simply don't have it, and
  // `{ ...defaultState, ...parsed }` on hydration fills it in with this
  // empty array rather than crashing or requiring a migration step.
  interests: [],
};
