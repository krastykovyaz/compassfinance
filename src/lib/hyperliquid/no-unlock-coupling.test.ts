import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getInvestmentAccess } from "@/lib/learning/unlocks";
import type { LearningProgress } from "@/lib/learning/types";

// Structural guardrail: the investment-unlock system must stay 100%
// learning-derived. This test fails the moment anyone adds a Hyperliquid
// import to either file, regardless of what they'd do with it — a
// behavioral-only test can't catch that, since neither function takes
// market data as an input at all.
describe("Hyperliquid integration never touches investment-unlock state", () => {
  it("unlocks.ts and trading-service.ts import nothing Hyperliquid-related", () => {
    const files = ["src/lib/learning/unlocks.ts", "src/server/services/trading-service.ts"];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/hyperliquid/i);
    }
  });
});

describe("getInvestmentAccess is unaffected by HYPERLIQUID_ENABLED", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.HYPERLIQUID_ENABLED;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  const progress: LearningProgress = {
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
  };

  it("btc and eth access status is identical whether the flag is on or off", () => {
    const before = {
      btc: getInvestmentAccess("btc", progress),
      eth: getInvestmentAccess("eth", progress),
    };

    process.env.HYPERLIQUID_ENABLED = "true";
    const after = {
      btc: getInvestmentAccess("btc", progress),
      eth: getInvestmentAccess("eth", progress),
    };

    expect(after).toEqual(before);
  });
});
