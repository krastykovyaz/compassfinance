import { describe, expect, it } from "vitest";
import { buildProgressStateFromServer, MeResponse } from "./build-progress-state";
import { DEFAULT_RISK_PROFILE_ID } from "@/lib/risk-profile/risk-profiles";

function makeMeResponse(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: { id: "user-1", locale: "en", riskProfileId: null, onboardingCompleted: false },
    interests: [],
    favorites: [],
    notificationPreferences: { news: true, priceAlerts: true, learning: true, achievements: true },
    progress: {
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
    },
    assetProgress: {},
    ...overrides,
  };
}

describe("buildProgressStateFromServer — Milestone 11.1 authenticated hydration", () => {
  it("maps server XP/achievements/completed-lessons straight onto ProgressState", () => {
    const me = makeMeResponse({
      progress: {
        totalXP: 250,
        level: 2,
        lessonsCompleted: 2,
        quizzesCompleted: 2,
        correctAnswers: 8,
        currentStreak: 3,
        longestStreak: 5,
        assetsExplored: 4,
        investmentsMade: 1,
        distinctAssetsInvested: 1,
        unlockedAchievements: ["FIRST_LESSON", "WEEK_STREAK"],
        completedLessons: ["sp500", "aapl"],
        completedQuizzes: ["sp500", "aapl"],
        practiceTradedAssetIds: [],
        lastActivityAt: "2026-08-17T00:00:00.000Z",
      },
    });
    const state = buildProgressStateFromServer(me, {});

    expect(state.xp).toBe(250);
    expect(state.achievements).toEqual(["FIRST_LESSON", "WEEK_STREAK"]);
    expect(state.completedLessons).toEqual(["sp500", "aapl"]);
    expect(state.quizzesCompletedCount).toBe(2);
    expect(state.correctAnswersCount).toBe(8);
    expect(state.currentStreak).toBe(3);
    expect(state.longestStreak).toBe(5);
    expect(state.lastActivityAt).toBe("2026-08-17T00:00:00.000Z");
  });

  it("never derives ProgressState from localStorage — only from the server payload passed in", () => {
    // No localStorage access happens anywhere in this function at all;
    // this test documents that invariant by construction: the function
    // signature only accepts server data + the session-only quiz-answer
    // buffer, nothing else.
    const me = makeMeResponse();
    const state = buildProgressStateFromServer(me, {});
    expect(state.xp).toBe(0);
    expect(state.completedLessons).toEqual([]);
  });

  it("maps sp500's dedicated top-level fields from assetProgress['sp500']", () => {
    const me = makeMeResponse({
      assetProgress: {
        sp500: { stepIndex: 3, lessonCompleted: true, quizCompleted: false },
      },
    });
    const state = buildProgressStateFromServer(me, {});
    expect(state.lessonStepIndex).toBe(3);
    expect(state.lessonCompleted).toBe(true);
    expect(state.quizCompleted).toBe(false);
  });

  it("maps every other asset into assetLessonProgress, keyed by assetId", () => {
    const me = makeMeResponse({
      assetProgress: {
        aapl: { stepIndex: 2, lessonCompleted: true, quizCompleted: true },
        nvda: { stepIndex: 0, lessonCompleted: false, quizCompleted: false },
      },
    });
    const state = buildProgressStateFromServer(me, {});
    expect(state.assetLessonProgress.aapl).toEqual({
      stepIndex: 2,
      lessonCompleted: true,
      quizCompleted: true,
      quizAnswers: {},
    });
    expect(state.assetLessonProgress.nvda.lessonCompleted).toBe(false);
    // sp500 must not also appear as a generic asset entry — it has its
    // own dedicated top-level fields (see previous test).
    expect(state.assetLessonProgress.sp500).toBeUndefined();
  });

  it("threads the session-only selected-answer buffer through for per-question UI feedback", () => {
    const me = makeMeResponse({ assetProgress: { aapl: { stepIndex: 1, lessonCompleted: false, quizCompleted: false } } });
    const state = buildProgressStateFromServer(me, { aapl: { q1: true, q2: false } });
    expect(state.assetLessonProgress.aapl.quizAnswers).toEqual({ q1: true, q2: false });
  });

  it("falls back to the default risk profile when the user hasn't set one, never an arbitrary value", () => {
    const me = makeMeResponse({ user: { id: "u1", locale: "en", riskProfileId: null, onboardingCompleted: false } });
    const state = buildProgressStateFromServer(me, {});
    expect(state.riskProfileId).toBe(DEFAULT_RISK_PROFILE_ID);
  });

  it("uses the server's risk profile verbatim when set", () => {
    const me = makeMeResponse({
      user: { id: "u1", locale: "en", riskProfileId: "WEALTH_BUILDER", onboardingCompleted: true },
    });
    const state = buildProgressStateFromServer(me, {});
    expect(state.riskProfileId).toBe("WEALTH_BUILDER");
  });

  it("never carries a stale field name for the now-removed practice-trading state", () => {
    const me = makeMeResponse();
    const state = buildProgressStateFromServer(me, {});
    expect("openPosition" in state).toBe(false);
    expect("closedPositions" in state).toBe(false);
  });

  it("maps interests directly from the server, not from any local cache", () => {
    const me = makeMeResponse({ interests: ["TECH_AI", "STOCKS"] });
    const state = buildProgressStateFromServer(me, {});
    expect(state.interests).toEqual(["TECH_AI", "STOCKS"]);
  });
});
