// Pure state-transition functions for the canonical ProgressState.
//
// Everything here is (state, ...args) => state (or a small result wrapper)
// with no React, no localStorage, and no Date.now()/Math.random() calls
// hidden inside anything that needs to be deterministic for a test.
// progress-store.tsx is the only caller that wires these to React's
// setState and to localStorage; it should not contain any state-shaping
// logic of its own beyond that wiring — see its comments.
//
// This is also what makes XP centralization (Milestone 8, item 9) and
// achievement idempotency (item 10) actually enforceable: every action
// that can award XP or unlock an achievement funnels through
// applyMutation() below, so "don't double-award" only needs to be gotten
// right once.

import { XP_REWARDS } from "./xp";
import { checkAchievements, getAchievement } from "./achievements";
import { deriveCompletedQuizzes, deriveLearningProgress, recordActivity } from "./progress";
import { AchievementDefinition } from "./types";
import {
  AssetLessonProgress,
  EMPTY_ASSET_LESSON_PROGRESS,
  ProgressState,
} from "./state";

// ---------------------------------------------------------------------------
// Achievement checking (shared by every mutating action)
// ---------------------------------------------------------------------------

/**
 * Derives LearningProgress from `s`, checks for newly-satisfied
 * achievements, and if any are found, folds their ids + XP rewards into
 * that same state. Idempotent: an achievement id already present in
 * `s.achievements` is never re-awarded (checkAchievements filters those
 * out), so calling this repeatedly on an already-settled state is a no-op.
 */
export function applyAchievementCheck(
  s: ProgressState
): { state: ProgressState; unlocked: AchievementDefinition | null } {
  const progress = deriveLearningProgress({
    xp: s.xp,
    completedLessons: s.completedLessons,
    completedQuizzes: deriveCompletedQuizzes(s),
    quizzesCompletedCount: s.quizzesCompletedCount,
    correctAnswersCount: s.correctAnswersCount,
    currentStreak: s.currentStreak,
    longestStreak: s.longestStreak,
    assetsExploredSlugs: s.assetsExploredSlugs,
    // Practice trading is no longer part of ProgressState (Milestone 16 —
    // it's a real, server-backed system now, tracked separately from
    // learning progress/achievements). No local reducer ever "closes a
    // trade" anymore, so this is always 0 here.
    investmentsMade: 0,
    distinctAssetsInvested: 0,
    achievements: s.achievements,
    lastActivityAt: s.lastActivityAt,
  });

  const newIds = checkAchievements(progress);
  if (newIds.length === 0) return { state: s, unlocked: null };

  const xpGained = newIds.reduce((sum, id) => sum + (getAchievement(id)?.xpReward ?? 0), 0);
  const nextState: ProgressState = {
    ...s,
    achievements: [...s.achievements, ...newIds],
    xp: s.xp + xpGained,
  };

  return { state: nextState, unlocked: getAchievement(newIds[0]) ?? null };
}

/**
 * The one mutation pipeline every XP-earning action goes through: run
 * `updater`, layer streak bookkeeping on top, then check achievements.
 * `now` is injectable so callers (tests) can pin the clock instead of
 * depending on the real one.
 */
export function applyMutation(
  s: ProgressState,
  updater: (s: ProgressState) => ProgressState,
  now: Date = new Date()
): { state: ProgressState; unlocked: AchievementDefinition | null } {
  const updated = updater(s);
  const withActivity: ProgressState = {
    ...updated,
    ...recordActivity(
      {
        currentStreak: s.currentStreak,
        longestStreak: s.longestStreak,
        lastActivityAt: s.lastActivityAt,
      },
      now
    ),
  };
  return applyAchievementCheck(withActivity);
}

// ---------------------------------------------------------------------------
// S&P 500's original dedicated lesson/quiz (untouched shape from Milestone 2)
// ---------------------------------------------------------------------------

export function advanceLessonStepReducer(s: ProgressState): ProgressState {
  return { ...s, lessonStepIndex: Math.min(5, s.lessonStepIndex + 1) };
}

/** Idempotent: XP and the completedLessons entry are only added once. */
export function completeLessonReducer(s: ProgressState): ProgressState {
  if (s.lessonCompleted) return s;
  return {
    ...s,
    lessonCompleted: true,
    xp: s.xp + XP_REWARDS.lessonCompleted,
    completedLessons: s.completedLessons.includes("sp500")
      ? s.completedLessons
      : [...s.completedLessons, "sp500"],
  };
}

/** Idempotent per questionId: answering the same question again is a no-op. */
export function answerQuizQuestionReducer(
  s: ProgressState,
  questionId: string,
  correct: boolean
): ProgressState {
  if (questionId in s.quizAnswers) return s;
  return {
    ...s,
    quizAnswers: { ...s.quizAnswers, [questionId]: correct },
    xp: s.xp + (correct ? XP_REWARDS.correctQuizAnswer : 0),
    correctAnswersCount: s.correctAnswersCount + (correct ? 1 : 0),
  };
}

export function completeQuizReducer(s: ProgressState): ProgressState {
  if (s.quizCompleted) return s;
  return {
    ...s,
    quizCompleted: true,
    xp: s.xp + XP_REWARDS.quizCompleted,
    quizzesCompletedCount: s.quizzesCompletedCount + 1,
  };
}

// ---------------------------------------------------------------------------
// Generic multi-asset lesson engine (Milestone 7) — mirrors the above,
// generalized to any assetId.
// ---------------------------------------------------------------------------

export function getAssetProgress(s: ProgressState, assetId: string): AssetLessonProgress {
  return s.assetLessonProgress[assetId] ?? EMPTY_ASSET_LESSON_PROGRESS;
}

export function advanceAssetLessonStepReducer(
  s: ProgressState,
  assetId: string,
  totalSteps: number
): ProgressState {
  const ap = getAssetProgress(s, assetId);
  return {
    ...s,
    assetLessonProgress: {
      ...s.assetLessonProgress,
      [assetId]: { ...ap, stepIndex: Math.min(totalSteps, ap.stepIndex + 1) },
    },
  };
}

export function completeAssetLessonReducer(s: ProgressState, assetId: string): ProgressState {
  const ap = getAssetProgress(s, assetId);
  if (ap.lessonCompleted) return s;
  return {
    ...s,
    xp: s.xp + XP_REWARDS.lessonCompleted,
    completedLessons: s.completedLessons.includes(assetId)
      ? s.completedLessons
      : [...s.completedLessons, assetId],
    assetLessonProgress: {
      ...s.assetLessonProgress,
      [assetId]: { ...ap, lessonCompleted: true },
    },
  };
}

export function answerAssetQuizQuestionReducer(
  s: ProgressState,
  assetId: string,
  questionId: string,
  correct: boolean
): ProgressState {
  const ap = getAssetProgress(s, assetId);
  if (questionId in ap.quizAnswers) return s;
  return {
    ...s,
    xp: s.xp + (correct ? XP_REWARDS.correctQuizAnswer : 0),
    correctAnswersCount: s.correctAnswersCount + (correct ? 1 : 0),
    assetLessonProgress: {
      ...s.assetLessonProgress,
      [assetId]: { ...ap, quizAnswers: { ...ap.quizAnswers, [questionId]: correct } },
    },
  };
}

export function completeAssetQuizReducer(s: ProgressState, assetId: string): ProgressState {
  const ap = getAssetProgress(s, assetId);
  if (ap.quizCompleted) return s;
  return {
    ...s,
    xp: s.xp + XP_REWARDS.quizCompleted,
    quizzesCompletedCount: s.quizzesCompletedCount + 1,
    assetLessonProgress: {
      ...s.assetLessonProgress,
      [assetId]: { ...ap, quizCompleted: true },
    },
  };
}

export function recordAssetViewReducer(s: ProgressState, slug: string): ProgressState {
  return s.assetsExploredSlugs.includes(slug)
    ? s
    : { ...s, assetsExploredSlugs: [...s.assetsExploredSlugs, slug] };
}

