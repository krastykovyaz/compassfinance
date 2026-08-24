// Centralized achievement definitions.
// Each achievement is a pure predicate over LearningProgress — no side
// effects, no persistence, no UI. Something else (progress-store.tsx) is
// responsible for calling checkAchievements() after state changes and
// persisting whichever ids come back.
//
// Status as of Milestone 7 (real multi-asset lesson content shipped):
//   - Reachable now: FIRST_LESSON, FIRST_QUIZ, FIRST_INVESTMENT,
//     MARKET_BASICS, INDEX_EXPLORER, SEVEN_DAY_STREAK, and now
//     STOCK_EXPLORER too, since AAPL/TSLA/NVDA all have real lessons.
//   - DIVERSIFIED is based on the real paper-trading ledger and requires
//     three distinct assetIds, not three trades of the same asset.

import { AchievementDefinition, LearningProgress } from "./types";

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "FIRST_LESSON",
    title: "First Step",
    description: "Complete your first learning lesson.",
    icon: "footprints",
    xpReward: 50,
    isUnlocked: (p) => p.lessonsCompleted >= 1,
  },
  {
    id: "FIRST_QUIZ",
    title: "Quiz Starter",
    description: "Complete your first quiz.",
    icon: "help-circle",
    xpReward: 25,
    isUnlocked: (p) => p.quizzesCompleted >= 1,
  },
  {
    id: "FIRST_INVESTMENT",
    title: "First Investment",
    description: "Make your first investment.",
    icon: "trending-up",
    xpReward: 100,
    isUnlocked: (p) => p.investmentsMade >= 1,
  },
  {
    id: "MARKET_BASICS",
    title: "Market Basics",
    description: "Complete the basic market fundamentals learning path.",
    icon: "landmark",
    xpReward: 50,
    // The S&P 500 path IS the basic-fundamentals path today, so this
    // fires alongside FIRST_LESSON until a second, deeper path exists.
    isUnlocked: (p) => p.completedLessons.includes("sp500"),
  },
  {
    id: "INDEX_EXPLORER",
    title: "Index Explorer",
    description: "Learn about your first market index.",
    icon: "line-chart",
    xpReward: 50,
    isUnlocked: (p) => p.completedLessons.includes("sp500"),
  },
  {
    id: "STOCK_EXPLORER",
    title: "Stock Explorer",
    description: "Learn about your first individual company.",
    icon: "building-2",
    xpReward: 50,
    // AAPL, TSLA, and NVDA all have real lessons as of Milestone 7 — this
    // unlocks the moment any one of them is completed.
    isUnlocked: (p) =>
      p.completedLessons.some((id) => STOCK_LESSON_IDS.includes(id)),
  },
  {
    id: "DIVERSIFIED",
    title: "Diversified",
    description: "Invest in at least 3 different assets.",
    icon: "layers",
    xpReward: 100,
    // Milestone 19: fixed to require 3 DISTINCT assetIds, not 3 trades —
    // p.distinctAssetsInvested is a real count of unique assets ever
    // traded (see learning-repository.ts's getPracticeTradedAssetIds),
    // so three trades of the same asset no longer satisfies this.
    isUnlocked: (p) => p.distinctAssetsInvested >= 3,
  },
  {
    id: "SEVEN_DAY_STREAK",
    title: "7 Day Streak",
    description: "Learn for 7 consecutive days.",
    icon: "flame",
    xpReward: 100,
    isUnlocked: (p) => p.longestStreak >= 7,
  },
];

// Kept separate/exported so unlocks.ts's stage definitions and this file
// agree on what counts as a "stock lesson" without hardcoding ids twice.
export const STOCK_LESSON_IDS = ["aapl", "tsla", "nvda"];

export function getAchievement(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/**
 * Returns achievement ids that are newly satisfied by `progress` but not
 * already present in `progress.unlockedAchievements`. Pure — does not
 * mutate anything or award XP itself; the caller decides what to do with
 * the result (progress-store.tsx adds them to state and awards their XP).
 */
export function checkAchievements(progress: LearningProgress): string[] {
  return ACHIEVEMENTS.filter(
    (a) => !progress.unlockedAchievements.includes(a.id) && a.isUnlocked(progress)
  ).map((a) => a.id);
}
