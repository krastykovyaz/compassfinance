import { describe, expect, it } from "vitest";
import { getLearningAccess, getAssetLearningAccess, isLearningAvailable } from "./access";
import { getInvestmentAccess } from "./unlocks";
import { deriveCompletedQuizzes, deriveLearningProgress } from "./progress";
import { defaultState } from "./state";
import { recordAssetViewReducer, completeAssetLessonReducer, completeAssetQuizReducer } from "./reducer";
import { ASSET_LEARNING_PATH_ORDER, ALL_ASSET_LEARNING_PATHS } from "./content";

function progressFor(state: typeof defaultState) {
  return deriveLearningProgress({
    xp: state.xp,
    completedLessons: state.completedLessons,
    completedQuizzes: deriveCompletedQuizzes(state),
    quizzesCompletedCount: state.quizzesCompletedCount,
    correctAnswersCount: state.correctAnswersCount,
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    assetsExploredSlugs: state.assetsExploredSlugs,
    // Practice trading is no longer part of ProgressState (Milestone 16 —
    // it's a real, server-backed system now) — this test helper never
    // exercised investment-count-based access rules, so 0 is correct here.
    investmentsMade: 0,
    distinctAssetsInvested: 0,
    achievements: state.achievements,
    lastActivityAt: state.lastActivityAt,
  });
}

describe("asset has learning content (test 1)", () => {
  it("resolves AVAILABLE for a fresh, never-touched asset with real content", () => {
    expect(getLearningAccess("btc", null)).toBe("AVAILABLE");
    expect(isLearningAvailable("btc")).toBe(true);
  });

  it("resolves NOT_AVAILABLE for an assetId with no content at all", () => {
    expect(getLearningAccess("not-a-real-asset", null)).toBe("NOT_AVAILABLE");
    expect(isLearningAvailable("not-a-real-asset")).toBe(false);
  });
});

describe("investment-locked asset still has learning access (test 2)", () => {
  it("nasdaq (investment LOCKED for a new user) is still learning-AVAILABLE", () => {
    const p = progressFor(defaultState);
    expect(getInvestmentAccess("nasdaq", p)).toBe("LOCKED");
    expect(getAssetLearningAccess(defaultState, "nasdaq")).toBe("AVAILABLE");
  });

  it("single-stage assets (BTC, Gold, MSFT...) are gated only by their own lesson, never a prerequisite chain, and are always learning-available regardless of investment status", () => {
    // Corrected from the stale "no investment stage at all" assumption
    // this test previously encoded: every catalog asset now has its own
    // investment-unlock stage (see INVESTMENT_UNLOCK_STAGES in
    // unlocks.ts) — these specific ones just have no prerequisiteAssetId,
    // so they go straight to AVAILABLE (not LOCKED) until their own
    // lesson is completed, then UNLOCKED. Business rules unchanged here;
    // only this test's outdated expectation is being corrected.
    const p = progressFor(defaultState);
    for (const assetId of ["btc", "eth", "gold", "brent-oil", "msft", "amzn", "googl", "meta"]) {
      expect(getInvestmentAccess(assetId, p)).toBe("AVAILABLE");
      expect(getAssetLearningAccess(defaultState, assetId)).not.toBe("NOT_AVAILABLE");

      const completed = {
        ...defaultState,
        completedLessons: [...defaultState.completedLessons, assetId],
        assetLessonProgress: {
          ...defaultState.assetLessonProgress,
          [assetId]: { stepIndex: 0, lessonCompleted: true, quizAnswers: {}, quizCompleted: true },
        },
      };
      const pCompleted = progressFor(completed);
      expect(getInvestmentAccess(assetId, pCompleted)).toBe("UNLOCKED");
    }
  });
});

describe("completing lessons moves learning access to COMPLETED (test 3)", () => {
  it("nasdaq: AVAILABLE -> IN_PROGRESS -> COMPLETED, independent of investment status", () => {
    expect(getAssetLearningAccess(defaultState, "nasdaq")).toBe("AVAILABLE");

    const started = { ...defaultState, assetLessonProgress: { nasdaq: { stepIndex: 1, lessonCompleted: false, quizAnswers: {}, quizCompleted: false } } };
    expect(getAssetLearningAccess(started, "nasdaq")).toBe("IN_PROGRESS");

    const lessonDone = completeAssetLessonReducer(defaultState, "nasdaq");
    expect(getAssetLearningAccess(lessonDone, "nasdaq")).toBe("IN_PROGRESS");

    const quizDone = completeAssetQuizReducer(lessonDone, "nasdaq");
    expect(getAssetLearningAccess(quizDone, "nasdaq")).toBe("COMPLETED");

    // Investment status is a completely separate question — nasdaq's own
    // investment requirement (just its lesson, per unlocks.ts) is now also
    // satisfied, so it happens to read UNLOCKED here too. The point isn't
    // that they move in lockstep — it's that getAssetLearningAccess never
    // consulted investment state to get to COMPLETED in the first place.
    expect(getInvestmentAccess("nasdaq", progressFor(quizDone))).toBe("UNLOCKED");
  });

  it("sp500 uses its own dedicated top-level fields, not assetLessonProgress", () => {
    const done = { ...defaultState, lessonCompleted: true, quizCompleted: true };
    expect(getAssetLearningAccess(done, "sp500")).toBe("COMPLETED");
  });

  it("aapl: learning reaches COMPLETED while investment stays non-UNLOCKED (missing achievement)", () => {
    const lessonDone = completeAssetLessonReducer(defaultState, "aapl");
    const quizDone = completeAssetQuizReducer(lessonDone, "aapl");

    expect(getAssetLearningAccess(quizDone, "aapl")).toBe("COMPLETED");
    // aapl's investment stage also requires the STOCK_EXPLORER achievement
    // (see unlocks.ts), which nothing here granted — so investment access
    // stays LOCKED/AVAILABLE even though learning is fully COMPLETED. This
    // is the clearest proof the two are decided independently.
    expect(getInvestmentAccess("aapl", progressFor(quizDone))).not.toBe("UNLOCKED");
  });
});

describe("news / exploration never changes investment access (tests 8 & 9)", () => {
  it("viewing an asset page (recordAssetView) leaves investment access for every asset unchanged", () => {
    const before = progressFor(defaultState);
    const after = progressFor(recordAssetViewReducer(defaultState, "nasdaq"));

    for (const assetId of ASSET_LEARNING_PATH_ORDER) {
      expect(getInvestmentAccess(assetId, after)).toBe(getInvestmentAccess(assetId, before));
    }
  });

  it("viewing an asset page also leaves that asset's own learning access unchanged", () => {
    const before = getAssetLearningAccess(defaultState, "nasdaq");
    const afterView = recordAssetViewReducer(defaultState, "nasdaq");
    expect(getAssetLearningAccess(afterView, "nasdaq")).toBe(before);
  });
});

describe("all 13 assets have valid learning access behavior (test 11)", () => {
  it("every content assetId resolves to a real status, never NOT_AVAILABLE", () => {
    expect(ASSET_LEARNING_PATH_ORDER).toHaveLength(13);
    for (const assetId of ASSET_LEARNING_PATH_ORDER) {
      const status = getAssetLearningAccess(defaultState, assetId);
      expect(["AVAILABLE", "IN_PROGRESS", "COMPLETED"]).toContain(status);
    }
  });
});

describe("all four categories are learnable (test 12)", () => {
  it("at least one asset of each category resolves learning access correctly", () => {
    const byCategory = {
      index: "sp500",
      stock: "aapl",
      commodity: "gold",
      crypto: "btc",
    } as const;

    for (const [category, assetId] of Object.entries(byCategory)) {
      expect(ALL_ASSET_LEARNING_PATHS[assetId].category).toBe(category);
      expect(getAssetLearningAccess(defaultState, assetId)).toBe("AVAILABLE");
    }
  });
});
