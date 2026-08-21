import { describe, expect, it } from "vitest";
import { gradeQuiz, PASS_THRESHOLD_RATIO } from "./quiz-grading";
import { getAssetLearningPath } from "@/lib/learning/content";

describe("gradeQuiz — server-authoritative grading (Milestone 11, Section 12)", () => {
  it("throws for an unknown assetId rather than silently grading nothing", () => {
    expect(() => gradeQuiz("not-a-real-asset", [])).toThrow();
  });

  it("scores every canonical question, ignoring anything not in the question bank", () => {
    const path = getAssetLearningPath("sp500")!;
    const correctAnswers = path.quizQuestions.map((q) => ({
      questionId: q.id,
      selectedOptionId: q.correctAnswer,
    }));

    const result = gradeQuiz("sp500", [
      ...correctAnswers,
      { questionId: "not-a-real-question", selectedOptionId: 0 },
    ]);

    expect(result.score).toBe(path.quizQuestions.length);
    expect(result.totalQuestions).toBe(path.quizQuestions.length);
    expect(result.passed).toBe(true);
    expect(result.perQuestion).toHaveLength(path.quizQuestions.length);
  });

  it("marks unanswered questions incorrect rather than skipping them", () => {
    const path = getAssetLearningPath("sp500")!;
    const result = gradeQuiz("sp500", []);
    expect(result.score).toBe(0);
    expect(result.totalQuestions).toBe(path.quizQuestions.length);
    expect(result.passed).toBe(false);
    expect(result.perQuestion.every((q) => !q.correct)).toBe(true);
  });

  it("never derives pass/fail from anything the caller supplies — only from correctAnswer", () => {
    const path = getAssetLearningPath("aapl")!;
    // Deliberately submit a wrong answer for every question but try to
    // smuggle a `passed: true` / `score: 999` alongside it — gradeQuiz's
    // input type doesn't even accept those fields, but this also proves
    // the *output* isn't influenced by anything but correctness.
    const wrongAnswers = path.quizQuestions.map((q) => ({
      questionId: q.id,
      selectedOptionId: (q.correctAnswer + 1) % q.options.length,
    }));
    const result = gradeQuiz("aapl", wrongAnswers);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("passes only at or above the documented threshold", () => {
    const path = getAssetLearningPath("nvda")!;
    const total = path.quizQuestions.length;
    const passingCount = Math.ceil(total * PASS_THRESHOLD_RATIO);
    const failingCount = passingCount - 1;

    const makeAnswers = (correctCount: number) =>
      path.quizQuestions.map((q, i) => ({
        questionId: q.id,
        selectedOptionId: i < correctCount ? q.correctAnswer : (q.correctAnswer + 1) % q.options.length,
      }));

    expect(gradeQuiz("nvda", makeAnswers(passingCount)).passed).toBe(true);
    expect(gradeQuiz("nvda", makeAnswers(failingCount)).passed).toBe(false);
  });

  it("grades identically across repeated calls with the same input (deterministic, replay-safe)", () => {
    const path = getAssetLearningPath("sp500")!;
    const answers = path.quizQuestions.map((q) => ({
      questionId: q.id,
      selectedOptionId: q.correctAnswer,
    }));
    const first = gradeQuiz("sp500", answers);
    const second = gradeQuiz("sp500", answers);
    expect(first).toEqual(second);
  });
});
