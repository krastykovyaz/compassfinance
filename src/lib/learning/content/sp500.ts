// S&P 500 — the one asset with a real, pre-existing lesson (built in
// Milestone 2, at /learn/indices/sp500). Rather than rewriting that lesson,
// this file is a thin ADAPTER: it re-shapes the existing sp500LessonSteps /
// sp500Quiz data (unchanged, still imported and used directly by the
// dedicated page) into the new generic AssetLearningPath model, purely so
// the content registry is complete for all 13 assets and future tooling
// (the /learn page's "Explore" list, the future LLM pipeline) has one
// consistent shape to read regardless of asset. The dedicated
// /learn/indices/sp500 page does NOT read from this file — see the note in
// unlocks.ts and the Milestone 7 README section for why that's the safer
// choice ("do not regress the existing lesson").

import { sp500Lesson, sp500LessonSteps, sp500Quiz } from "@/lib/lesson-content";
import { AssetLearningPath, LessonContent, QuizQuestionContent } from "./types";

const lessons: LessonContent[] = sp500LessonSteps.map((step) => ({
  id: step.id,
  title: step.title,
  objective: `Understand: ${step.title.replace(/\?$/, "")}.`,
  explanation: step.body,
  keyTakeaways: [step.body.split(".")[0].trim() + "."],
  estimatedMinutes: 1,
}));

const DIFFICULTY_BY_INDEX: QuizQuestionContent["difficulty"][] = [
  "easy",
  "easy",
  "medium",
  "medium",
  "hard",
];

const quizQuestions: QuizQuestionContent[] = sp500Quiz.map((q, i) => ({
  id: q.id,
  lessonId: sp500LessonSteps[Math.min(i, sp500LessonSteps.length - 1)].id,
  question: q.prompt,
  options: q.options,
  correctAnswer: q.correctIndex,
  explanation: q.explanation,
  difficulty: DIFFICULTY_BY_INDEX[i] ?? "medium",
}));

export const sp500LearningPath: AssetLearningPath = {
  assetId: "sp500",
  title: sp500Lesson.title,
  shortDescription: "What a market index is, and how the S&P 500 works.",
  category: "index",
  lessons,
  quizQuestions,
  completionReward: sp500Lesson.xpReward,
  // Reference example for the optional Milestone 10 fields (Part 20) —
  // explicit here because sp500's lessons are terse (see the derived
  // `objective` above), so the generic fallback in
  // src/lib/ai/curriculum-context.ts is worth overriding with something
  // more useful for the AI layer. Every other asset relies on that
  // fallback instead of duplicating this.
  learningObjectives: [
    "Understand what a market index is and what it measures.",
    "Understand how the S&P 500 is constructed and weighted.",
    "Understand what can make the index's price move.",
  ],
  concepts: ["market index", "market capitalization", "weighting", "diversification", "S&P 500"],
};
