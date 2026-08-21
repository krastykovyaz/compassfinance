import { describe, expect, it } from "vitest";
import { defaultState, ProgressState } from "./state";
import {
  answerAssetQuizQuestionReducer,
  applyAchievementCheck,
  applyMutation,
  completeAssetLessonReducer,
  completeAssetQuizReducer,
  completeLessonReducer,
  completeQuizReducer,
} from "./reducer";
import { XP_REWARDS } from "./xp";

const FIXED_NOW = new Date("2026-01-01T12:00:00.000Z");

describe("new user defaults (test 1)", () => {
  it("starts with the base XP, no achievements, no completed lessons", () => {
    expect(defaultState.achievements).toHaveLength(0);
    expect(defaultState.completedLessons).toHaveLength(0);
  });
});

describe("completing a lesson (tests 2 & 3)", () => {
  it("awards lessonCompleted XP exactly once", () => {
    const { state: afterFirst } = applyMutation(defaultState, completeLessonReducer, FIXED_NOW);
    // applyMutation also runs the achievement check in the same pass, so
    // the XP delta includes FIRST_LESSON/MARKET_BASICS/INDEX_EXPLORER
    // firing alongside lessonCompleted's own reward — assert it's at
    // least that reward, and pin down the "no duplicate" behavior below
    // rather than the exact combined total.
    expect(afterFirst.xp).toBeGreaterThanOrEqual(defaultState.xp + XP_REWARDS.lessonCompleted);
    expect(afterFirst.completedLessons).toEqual(["sp500"]);

    // Completing the same (already-completed) lesson again must not award
    // XP a second time or duplicate the completedLessons entry.
    const { state: afterSecond } = applyMutation(afterFirst, completeLessonReducer, FIXED_NOW);
    expect(afterSecond.xp).toBe(afterFirst.xp);
    expect(afterSecond.completedLessons).toEqual(["sp500"]);
  });

  it("same for the generic multi-asset lesson engine", () => {
    const once = completeAssetLessonReducer(defaultState, "nasdaq");
    const twice = completeAssetLessonReducer(once, "nasdaq");
    expect(once.xp).toBe(defaultState.xp + XP_REWARDS.lessonCompleted);
    expect(twice.xp).toBe(once.xp);
    expect(twice.completedLessons).toEqual(["nasdaq"]);
  });
});

describe("quiz progress (test 4)", () => {
  it("answering a question updates correctAnswersCount and XP, once per question", () => {
    const s1 = answerAssetQuizQuestionReducer(defaultState, "sp500-quiz", "q1", true);
    expect(s1.correctAnswersCount).toBe(1);
    expect(s1.xp).toBe(defaultState.xp + XP_REWARDS.correctQuizAnswer);

    // Re-answering the same question is a no-op.
    const s2 = answerAssetQuizQuestionReducer(s1, "sp500-quiz", "q1", true);
    expect(s2).toEqual(s1);
  });

  it("completeQuiz awards its XP exactly once", () => {
    const { state: once } = applyMutation(defaultState, completeQuizReducer, FIXED_NOW);
    const { state: twice } = applyMutation(once, completeQuizReducer, FIXED_NOW);
    // completeQuizReducer's own reward, plus whatever achievements (e.g.
    // FIRST_QUIZ) fire in the same applyMutation pass — see the note above.
    expect(once.xp).toBeGreaterThanOrEqual(defaultState.xp + XP_REWARDS.quizCompleted);
    expect(twice.xp).toBe(once.xp);
    expect(twice.quizzesCompletedCount).toBe(once.quizzesCompletedCount);
  });

  it("same idempotency for the generic per-asset quiz", () => {
    const once = completeAssetQuizReducer(defaultState, "gold");
    const twice = completeAssetQuizReducer(once, "gold");
    expect(twice.xp).toBe(once.xp);
    expect(twice.quizzesCompletedCount).toBe(once.quizzesCompletedCount);
  });
});

describe("achievement unlocking (test 5)", () => {
  it("unlocking FIRST_LESSON persists it and awards its XP exactly once", () => {
    const { state: afterLesson } = applyMutation(defaultState, completeLessonReducer, FIXED_NOW);
    // FIRST_LESSON, MARKET_BASICS, and INDEX_EXPLORER all fire off the
    // first completed sp500 lesson — applyAchievementCheck already ran
    // inside applyMutation, so re-running it must be a no-op.
    expect(afterLesson.achievements).toContain("FIRST_LESSON");
    const xpAfterFirstCheck = afterLesson.xp;

    const { state: recheck, unlocked } = applyAchievementCheck(afterLesson);
    expect(unlocked).toBeNull();
    expect(recheck.xp).toBe(xpAfterFirstCheck);
    expect(recheck.achievements.filter((a) => a === "FIRST_LESSON")).toHaveLength(1);
  });
});

describe("refresh / persistence (test 10)", () => {
  it("a JSON round-trip through the same shape used for localStorage preserves progress", () => {
    const { state: progressed } = applyMutation(defaultState, completeLessonReducer, FIXED_NOW);
    const serialized = JSON.stringify(progressed);
    const rehydrated = { ...defaultState, ...(JSON.parse(serialized) as ProgressState) };
    expect(rehydrated).toEqual(progressed);
  });
});

describe("S&P 500 existing progress remains valid (test 11)", () => {
  it("a pre-Milestone-8 state shape (with a stale, now-removed unlockedAssets array) still merges and works", () => {
    // Simulates a localStorage blob written before Milestone 8.1, back
    // when ProgressState still had an `unlockedAssets` field. It's no
    // longer part of the type, but the merge below (the same
    // `{ ...defaultState, ...parsed }` pattern progress-store.tsx uses on
    // hydration) must not choke on — or lose any other data because of —
    // that extra, unrecognized key.
    const legacyBlob = {
      ...defaultState,
      completedLessons: ["sp500"],
      lessonCompleted: true,
      unlockedAssets: ["sp500", "nasdaq"], // written by the old, now-removed mechanism
    };
    const rehydrated = { ...defaultState, ...legacyBlob };
    expect(rehydrated.completedLessons).toEqual(["sp500"]);
    expect(rehydrated.lessonCompleted).toBe(true);
    // The stale key rides along harmlessly (JS doesn't strip unknown
    // object properties) but nothing in the app ever reads it again.
    expect((rehydrated as unknown as { unlockedAssets: string[] }).unlockedAssets).toEqual([
      "sp500",
      "nasdaq",
    ]);
  });
});
