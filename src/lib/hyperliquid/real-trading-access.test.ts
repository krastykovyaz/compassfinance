import { describe, expect, it } from "vitest";
import { getRealTradingAccess, isRealTradingUnlocked } from "./real-trading-access";
import type { LearningProgress } from "@/lib/learning/types";

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
    completedQuizzes: [],
    practiceTradedAssetIds: [],
    lastActivityAt: null,
    ...overrides,
  };
}

describe("getRealTradingAccess — the Phase 7 real-trading education gate", () => {
  it("LOCKED_NO_MARKET for an approved asset with no verified Hyperliquid mapping, no matter how complete the progress is", () => {
    const fullyDoneEverything = progress({
      completedLessons: ["aapl"],
      completedQuizzes: ["aapl"],
      practiceTradedAssetIds: ["aapl"],
      unlockedAchievements: ["STOCK_EXPLORER"],
    });
    expect(getRealTradingAccess("aapl", fullyDoneEverything)).toBe("LOCKED_NO_MARKET");
    expect(getRealTradingAccess("sp500", fullyDoneEverything)).toBe("LOCKED_NO_MARKET");
    expect(getRealTradingAccess("gold", fullyDoneEverything)).toBe("LOCKED_NO_MARKET");
  });

  it("LOCKED_EDUCATION when the required course/quiz aren't complete yet, even with a practice trade already on record", () => {
    // A practice trade with no course/quiz done shouldn't be reachable in
    // practice (Paper Trading BUY itself requires isInvestmentUnlocked —
    // see trading-service.ts), but the gate must still fail closed if it
    // somehow happened, rather than let an incomplete education slide.
    const noEducation = progress({ practiceTradedAssetIds: ["btc"] });
    expect(getRealTradingAccess("btc", noEducation)).toBe("LOCKED_EDUCATION");
    expect(isRealTradingUnlocked("btc", noEducation)).toBe(false);
  });

  it("LOCKED_EDUCATION when only the lesson is done but not the quiz — reading isn't the same as finishing the course", () => {
    const lessonOnly = progress({ completedLessons: ["eth"] });
    expect(getRealTradingAccess("eth", lessonOnly)).toBe("LOCKED_EDUCATION");
  });

  it("LOCKED_NO_PRACTICE_TRADE once education is complete but no Paper Trade of this asset exists yet", () => {
    const educationDoneNoPractice = progress({
      completedLessons: ["btc"],
      completedQuizzes: ["btc"],
      practiceTradedAssetIds: [], // never traded btc in Paper Trading
    });
    expect(getRealTradingAccess("btc", educationDoneNoPractice)).toBe("LOCKED_NO_PRACTICE_TRADE");
    expect(isRealTradingUnlocked("btc", educationDoneNoPractice)).toBe(false);
  });

  it("a practice trade of a DIFFERENT asset doesn't satisfy this asset's own requirement", () => {
    const tradedOnlyEth = progress({
      completedLessons: ["btc"],
      completedQuizzes: ["btc"],
      practiceTradedAssetIds: ["eth"], // traded eth, not btc
    });
    expect(getRealTradingAccess("btc", tradedOnlyEth)).toBe("LOCKED_NO_PRACTICE_TRADE");
  });

  it("UNLOCKED once course, quiz, AND a practice trade of this exact asset are all done", () => {
    const fullyUnlocked = progress({
      completedLessons: ["btc"],
      completedQuizzes: ["btc"],
      practiceTradedAssetIds: ["btc"],
    });
    expect(getRealTradingAccess("btc", fullyUnlocked)).toBe("UNLOCKED");
    expect(isRealTradingUnlocked("btc", fullyUnlocked)).toBe(true);
  });

  it("btc and eth are gated completely independently of each other", () => {
    const onlyBtcDone = progress({
      completedLessons: ["btc"],
      completedQuizzes: ["btc"],
      practiceTradedAssetIds: ["btc"],
    });
    expect(getRealTradingAccess("btc", onlyBtcDone)).toBe("UNLOCKED");
    expect(getRealTradingAccess("eth", onlyBtcDone)).not.toBe("UNLOCKED");
  });
});
