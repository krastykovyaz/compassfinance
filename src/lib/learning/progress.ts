// Pure "learning state" logic: turning the raw, persisted progress fields
// into the normalized LearningProgress shape the rest of this module (and
// the UI) works with, plus the streak-math helper used when recording
// activity.
//
// Deliberately does NOT import anything from progress-store.tsx — that
// would create a circular dependency, since progress-store.tsx is the
// thing that calls into this file. Instead this file defines the minimal
// structural shape it needs; progress-store.tsx's actual state happens to
// satisfy it, which TypeScript checks structurally without either file
// needing to import a type from the other.

import { LearningProgress } from "./types";
import { getLevelFromXP } from "./xp";

export type RawProgressInput = {
  xp: number;
  completedLessons: string[];
  quizzesCompletedCount: number;
  correctAnswersCount: number;
  currentStreak: number;
  longestStreak: number;
  assetsExploredSlugs: string[];
  investmentsMade: number;
  /** Count of distinct assetIds ever traded — see LearningProgress's field
   * of the same name. Local/anonymous progress has no real trading data
   * (paper trading is server-backed, authenticated-only — see
   * src/lib/trading/), so both call sites of this function pass 0. */
  distinctAssetsInvested: number;
  achievements: string[];
  lastActivityAt: string | null;
};

export function deriveLearningProgress(raw: RawProgressInput): LearningProgress {
  return {
    totalXP: raw.xp,
    level: getLevelFromXP(raw.xp).level,
    lessonsCompleted: raw.completedLessons.length,
    quizzesCompleted: raw.quizzesCompletedCount,
    correctAnswers: raw.correctAnswersCount,
    currentStreak: raw.currentStreak,
    longestStreak: raw.longestStreak,
    assetsExplored: raw.assetsExploredSlugs.length,
    investmentsMade: raw.investmentsMade,
    distinctAssetsInvested: raw.distinctAssetsInvested,
    unlockedAchievements: raw.achievements,
    completedLessons: raw.completedLessons,
    lastActivityAt: raw.lastActivityAt,
  };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD" — good enough for a local demo streak
}

/**
 * Pure streak update: call this once per "activity" (lesson step, quiz
 * answer, practice trade...). Same-day activity doesn't change the streak.
 * Activity exactly one calendar day after the last one extends it.
 * Anything else (a gap, or the very first activity) resets it to 1.
 */
export function recordActivity(
  prev: {
    currentStreak: number;
    longestStreak: number;
    lastActivityAt: string | null;
  },
  now: Date = new Date()
): { currentStreak: number; longestStreak: number; lastActivityAt: string } {
  const nowIso = now.toISOString();

  if (!prev.lastActivityAt) {
    return { currentStreak: 1, longestStreak: Math.max(1, prev.longestStreak), lastActivityAt: nowIso };
  }

  const todayKey = dayKey(nowIso);
  const lastKey = dayKey(prev.lastActivityAt);
  if (todayKey === lastKey) {
    // Same day — streak doesn't change, just refresh the timestamp.
    return { ...prev, lastActivityAt: nowIso };
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const wasYesterday = dayKey(yesterday.toISOString()) === lastKey;

  const nextStreak = wasYesterday ? prev.currentStreak + 1 : 1;
  return {
    currentStreak: nextStreak,
    longestStreak: Math.max(prev.longestStreak, nextStreak),
    lastActivityAt: nowIso,
  };
}
