// Single source of truth for XP values and level thresholds.
// Pure functions/constants only — no React, no persistence.
//
// src/lib/gamification.ts (the pre-existing level-info helper used by the
// Explore screen) is re-implemented on top of this file rather than keeping
// its own separate table, so there is exactly one XP/level configuration in
// the codebase, not two competing ones.

// ---------------------------------------------------------------------------
// XP rewards
// ---------------------------------------------------------------------------

export const XP_REWARDS = {
  lessonCompleted: 50,
  quizCompleted: 25,
  correctQuizAnswer: 25,
  firstInvestment: 100,
  assetLearningPathCompleted: 100,
} as const;

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export type LevelDefinition = { level: number; label: string; minXp: number };

// Levels 1-5 keep the labels already shown in the existing Explore UI.
// Levels 6-10 are a reasonable extension of that naming — the spec for this
// milestone only provided XP thresholds, not names, for levels 6-10.
export const LEVELS: LevelDefinition[] = [
  { level: 1, label: "Beginner", minXp: 0 },
  { level: 2, label: "Market Explorer", minXp: 250 },
  { level: 3, label: "Investor", minXp: 600 },
  { level: 4, label: "Investor in Progress", minXp: 1000 },
  { level: 5, label: "Market Navigator", minXp: 1500 },
  { level: 6, label: "Strategic Investor", minXp: 2250 },
  { level: 7, label: "Portfolio Builder", minXp: 3250 },
  { level: 8, label: "Market Analyst", minXp: 4500 },
  { level: 9, label: "Investment Expert", minXp: 6000 },
  { level: 10, label: "Master Investor", minXp: 8000 },
];

const MAX_LEVEL_STEP = 2000; // flat XP step used once a user is past Level 10

export function getLevelFromXP(xp: number): LevelDefinition {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.minXp) current = l;
  }

  const isAtOrPastMax = current.level === LEVELS[LEVELS.length - 1].level;
  if (!isAtOrPastMax) return current;

  // Keep progressing past the designed table using a flat step, so XP
  // earned beyond Level 10 still means something instead of capping out.
  const levelsPast = Math.floor((xp - current.minXp) / MAX_LEVEL_STEP);
  if (levelsPast <= 0) return current;
  return {
    level: current.level + levelsPast,
    label: current.label,
    minXp: current.minXp + levelsPast * MAX_LEVEL_STEP,
  };
}

export function getXPForNextLevel(xp: number): number {
  const current = getLevelFromXP(xp);
  const idx = LEVELS.findIndex((l) => l.level === current.level);
  if (idx >= 0 && idx < LEVELS.length - 1) {
    return LEVELS[idx + 1].minXp;
  }
  // Past the table (or exactly at the last defined level): next flat step.
  return current.minXp + MAX_LEVEL_STEP;
}

export function getLevelProgress(xp: number): number {
  const current = getLevelFromXP(xp);
  const nextFloor = getXPForNextLevel(xp);
  if (nextFloor <= current.minXp) return 100;
  const pct = ((xp - current.minXp) / (nextFloor - current.minXp)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
