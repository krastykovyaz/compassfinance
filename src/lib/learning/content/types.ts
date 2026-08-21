// Generic, reusable lesson/quiz content model for every Compass asset
// learning path — indices, stocks, commodities, and crypto all share this
// one shape so they can all run through the same lesson engine
// (src/app/learn/[assetId]/page.tsx) instead of one bespoke page per asset.
//
// This is also the contract a future LLM-driven content/grading pipeline
// would read from (see Milestone 7's "future LLM compatibility"
// requirement): Asset -> Lessons -> Key concepts -> Question bank ->
// correct answers -> explanations. Nothing here depends on React or
// localStorage — that's deliberate, so an LLM integration later only needs
// to read/write plain data through this shape.

export type QuestionDifficulty = "easy" | "medium" | "hard";

export type AssetContentCategory = "index" | "stock" | "commodity" | "crypto";

export type LessonContent = {
  id: string;
  title: string;
  /** One sentence: what the learner should be able to answer after this lesson. */
  objective: string;
  /** Main body text. Plain English — no financial advice, no return promises, no "safe" claims. */
  explanation: string;
  keyTakeaways: string[];
  estimatedMinutes: number;
};

export type QuizQuestionContent = {
  id: string;
  /** Which lesson this question checks understanding of. */
  lessonId: string;
  question: string;
  options: string[];
  /** Index into `options`. */
  correctAnswer: number;
  explanation: string;
  difficulty: QuestionDifficulty;
};

export type AssetLearningPath = {
  assetId: string;
  title: string;
  shortDescription: string;
  category: AssetContentCategory;
  lessons: LessonContent[];
  quizQuestions: QuizQuestionContent[];
  /**
   * Display-only XP badge shown in the lesson header. Actual XP is still
   * awarded granularly per lesson-completed / correct-answer / quiz-completed
   * event — the same mechanism every other learning action in the app uses
   * (see XP_REWARDS in learning/xp.ts and the asset* actions in
   * progress-store.tsx). This mirrors how sp500Lesson.xpReward already
   * worked before this milestone: a badge value, not a literal lump sum.
   */
  completionReward: number;
  /**
   * Milestone 10 (Part 20): optional, path-level metadata for the AI
   * Learning Engine. Genuinely optional — every existing content file
   * still type-checks and works without adding these, and
   * src/lib/ai/curriculum-context.ts derives reasonable equivalents from
   * `lessons`/`quizQuestions` when they're absent (lesson.objective ->
   * learningObjectives, lesson.keyTakeaways -> concepts). Add them
   * explicitly on a path only when the derived version isn't good enough
   * — sp500 does this as the reference example. This keeps Part 20's "do
   * not rewrite all course content" promise: 12 of the 13 asset files
   * needed zero changes for the AI layer to work.
   */
  learningObjectives?: string[];
  concepts?: string[];
};

// Note: unlock requirements (which lesson/achievement/XP gates investing in
// this asset) are NOT part of this type. That's the asset **unlock**
// system's job, not the learning **content** system's — see
// src/lib/learning/unlocks.ts's InvestmentUnlockDefinition, which is the single
// place unlock requirements are defined (Milestone 8). Keeping them out of
// this type prevents the two from silently drifting apart, which is what
// happened before Milestone 8: this type used to carry its own
// `unlockRequirements` field that nothing ever actually read.
