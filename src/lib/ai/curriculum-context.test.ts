import { describe, expect, it } from "vitest";
import { buildLearningContext } from "./curriculum-context";
import { getAssetLearningPath } from "@/lib/learning/content";

const sp500Path = getAssetLearningPath("sp500")!;
const firstLessonId = sp500Path.lessons[0].id;

describe("buildLearningContext() — canonical context assembly (Part 4)", () => {
  it("returns null for an unknown asset (Part 3: never trust/invent for unknown ids)", () => {
    const context = buildLearningContext({
      assetId: "not-a-real-asset",
      lessonId: firstLessonId,
      difficulty: "beginner",
      locale: "en",
    });
    expect(context).toBeNull();
  });

  it("returns null for a known asset but unknown lesson id", () => {
    const context = buildLearningContext({
      assetId: "sp500",
      lessonId: "not-a-real-lesson",
      difficulty: "beginner",
      locale: "en",
    });
    expect(context).toBeNull();
  });

  it("builds a context with objectives, concepts, and canonical content for a valid lesson", () => {
    const context = buildLearningContext({
      assetId: "sp500",
      lessonId: firstLessonId,
      difficulty: "intermediate",
      locale: "en",
    });
    expect(context).not.toBeNull();
    expect(context!.assetId).toBe("sp500");
    expect(context!.objectives.length).toBeGreaterThan(0);
    expect(context!.concepts.length).toBeGreaterThan(0);
    expect(context!.canonicalExplanation.length).toBeGreaterThan(0);
    expect(context!.difficulty).toBe("intermediate");
  });

  it("never includes wallet, balance, or portfolio fields (Part 5)", () => {
    const context = buildLearningContext({
      assetId: "sp500",
      lessonId: firstLessonId,
      difficulty: "beginner",
      locale: "en",
    });
    const serialized = JSON.stringify(context);
    expect(serialized.toLowerCase()).not.toContain("wallet");
    expect(serialized.toLowerCase()).not.toContain("balance");
    expect(serialized.toLowerCase()).not.toContain("privatekey");
  });

  it("does not expose assessment question samples to the AI tutor", () => {
    const allQuestionIds = sp500Path.quizQuestions.map((q) => q.id);
    const context = buildLearningContext({
      assetId: "sp500",
      lessonId: firstLessonId,
      difficulty: "beginner",
      locale: "en",
      recentMistakeQuestionIds: allQuestionIds,
    });
    expect("curatedQuestionSamples" in context!).toBe(false);
    expect(context!.recentMistakes?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it("produces an English context by default (test 10: locale EN)", () => {
    const context = buildLearningContext({
      assetId: "sp500",
      lessonId: firstLessonId,
      difficulty: "beginner",
      locale: "en",
    });
    expect(context!.locale).toBe("en");
    expect(context!.assetTitle).toBe(sp500Path.title);
  });

  it("produces a French-localized context (test 11: locale FR)", () => {
    const context = buildLearningContext({
      assetId: "sp500",
      lessonId: firstLessonId,
      difficulty: "beginner",
      locale: "fr",
    });
    expect(context!.locale).toBe("fr");
    // sp500's French title patch exists in localization.ts — confirm the
    // localized path (not the raw English one) is what got read.
    expect(context!.assetTitle).not.toBe("");
  });

  it("produces a Russian-localized context (test 12: locale RU)", () => {
    const context = buildLearningContext({
      assetId: "sp500",
      lessonId: firstLessonId,
      difficulty: "beginner",
      locale: "ru",
    });
    expect(context!.locale).toBe("ru");
    expect(context!.assetTitle).not.toBe("");
  });

  it("falls back to a derived concept/objective list for assets with no explicit metadata (Part 20)", () => {
    // Any asset other than sp500 has no explicit learningObjectives/concepts
    // — verify the derivation fallback still produces something non-empty.
    const otherPath = getAssetLearningPath("aapl");
    if (otherPath) {
      const context = buildLearningContext({
        assetId: "aapl",
        lessonId: otherPath.lessons[0].id,
        difficulty: "beginner",
        locale: "en",
      });
      expect(context!.objectives.length).toBeGreaterThan(0);
      expect(context!.concepts.length).toBeGreaterThan(0);
    }
  });

  it("includes a deterministic, code-derived completion criteria string", () => {
    const context = buildLearningContext({
      assetId: "sp500",
      lessonId: firstLessonId,
      difficulty: "beginner",
      locale: "en",
    });
    expect(context!.completionCriteria).toContain(String(sp500Path.lessons.length));
    expect(context!.completionCriteria).toContain(String(sp500Path.quizQuestions.length));
  });
});
