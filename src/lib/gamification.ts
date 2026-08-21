// Central XP / level progression logic used by existing components (e.g.
// the Explore screen's XPProgress card).
//
// The actual level table and XP reward values live in
// src/lib/learning/xp.ts — this file is now a thin adapter that keeps the
// existing getLevelInfo(xp) / XP_REWARDS import shape working for older
// call sites, without maintaining a second, competing configuration.

import {
  getLevelFromXP,
  getXPForNextLevel,
  getLevelProgress,
  XP_REWARDS as NEW_XP_REWARDS,
} from "./learning/xp";

export type LevelInfo = {
  level: number;
  label: string;
  xp: number;
  currentLevelFloor: number;
  xpToNextLevel: number;
  progressPct: number;
};

export function getLevelInfo(xp: number): LevelInfo {
  const current = getLevelFromXP(xp);
  return {
    level: current.level,
    label: current.label,
    xp,
    currentLevelFloor: current.minXp,
    xpToNextLevel: getXPForNextLevel(xp),
    progressPct: getLevelProgress(xp),
  };
}

// Re-exported under the old names so existing call sites in
// progress-store.tsx (built in an earlier milestone) don't need to change
// their imports. Values now come from the single centralized config in
// learning/xp.ts — there is no "opening a position" reward in the new
// config, so that key is intentionally gone rather than kept as a
// disguised zero.
export const XP_REWARDS = {
  lessonComplete: NEW_XP_REWARDS.lessonCompleted,
  quizCorrectAnswer: NEW_XP_REWARDS.correctQuizAnswer,
  practiceTradeClosed: NEW_XP_REWARDS.assetLearningPathCompleted,
  firstPositionAchievement: NEW_XP_REWARDS.firstInvestment,
};
