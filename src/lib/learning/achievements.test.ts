import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "./achievements";
import { LearningProgress } from "./types";

function progress(overrides: Partial<LearningProgress> = {}): LearningProgress {
  return {
    totalXP: 0,
    level: 1,
    lessonsCompleted: 0,
    quizzesCompleted: 0,
    correctAnswers: 0,
    currentStreak: 0,
    longestStreak: 0,
    assetsExplored: 0,
    investmentsMade: 0,
    distinctAssetsInvested: 0,
    unlockedAchievements: [],
    completedLessons: [],
    lastActivityAt: null,
    ...overrides,
  };
}

function diversified(p: LearningProgress): boolean {
  return ACHIEVEMENTS.find((a) => a.id === "DIVERSIFIED")!.isUnlocked(p);
}

describe("DIVERSIFIED achievement — requires 3 DISTINCT assets, not 3 trades", () => {
  it("0 distinct assets -> locked", () => {
    expect(diversified(progress({ distinctAssetsInvested: 0, investmentsMade: 0 }))).toBe(false);
  });

  it("1 distinct asset -> locked", () => {
    expect(diversified(progress({ distinctAssetsInvested: 1, investmentsMade: 1 }))).toBe(false);
  });

  it("2 distinct assets -> locked", () => {
    expect(diversified(progress({ distinctAssetsInvested: 2, investmentsMade: 2 }))).toBe(false);
  });

  it("3 distinct assets -> unlocked", () => {
    expect(diversified(progress({ distinctAssetsInvested: 3, investmentsMade: 3 }))).toBe(true);
  });

  it("multiple trades in the same asset still count as 1 distinct asset -> stays locked", () => {
    // e.g. 5 separate BUY/SELL trades of AAPL: investmentsMade is high,
    // but distinctAssetsInvested (the real source this achievement now
    // reads) is only 1.
    expect(diversified(progress({ distinctAssetsInvested: 1, investmentsMade: 5 }))).toBe(false);
  });

  it("3 different asset IDs (e.g. SP500, AAPL, BTC) -> unlocked, even with a low raw trade count", () => {
    // Exactly 3 trades, one per distinct asset, is the minimal case that
    // should unlock — proves the check no longer depends on trade count.
    expect(diversified(progress({ distinctAssetsInvested: 3, investmentsMade: 3 }))).toBe(true);
  });

  it("never unlocks from a default/mock value — only from a real distinctAssetsInvested >= 3", () => {
    expect(diversified(progress())).toBe(false);
  });
});
