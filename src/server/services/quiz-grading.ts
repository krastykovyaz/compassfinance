// Pure server-side quiz grading. Deliberately has NO Prisma import and no
// "server-only" marker so it can be unit-tested directly (see
// quiz-grading.test.ts) without needing a real database connection —
// same "pure logic separate from persistence" split the rest of
// src/lib/learning/* already follows.
import { getAssetLearningPath } from "@/lib/learning/content";

// Not something the pre-Milestone-11 client tracked (progression there
// only ever depended on lesson + quiz *completion*, never a score
// threshold) — this is a new, explicit rule for server-side grading.
// 70% is a reasonable default for a 5-6 question bank; documented here and
// in the README rather than left implicit.
export const PASS_THRESHOLD_RATIO = 0.7;

export type QuizAnswerInput = { questionId: string; selectedOptionId: number };

export type QuizGradeResult = {
  score: number;
  totalQuestions: number;
  passed: boolean;
  perQuestion: { questionId: string; correct: boolean }[];
};

/**
 * Grades a submission against the canonical, server-side answer key
 * (src/lib/learning/content/*.ts) — a client-submitted `passed`/`score`
 * value is never read anywhere in this codebase (Section 12). Answers for
 * questions the learner didn't submit are simply marked incorrect; there's
 * no way to game the count by omitting hard questions.
 */
export function gradeQuiz(assetId: string, answers: QuizAnswerInput[]): QuizGradeResult {
  const path = getAssetLearningPath(assetId);
  if (!path) {
    throw new Error(`Unknown assetId: ${assetId}`);
  }
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a.selectedOptionId]));

  const perQuestion = path.quizQuestions.map((q) => ({
    questionId: q.id,
    correct: answerByQuestion.get(q.id) === q.correctAnswer,
  }));
  const score = perQuestion.filter((q) => q.correct).length;
  const totalQuestions = path.quizQuestions.length;
  const passed = totalQuestions > 0 && score / totalQuestions >= PASS_THRESHOLD_RATIO;

  return { score, totalQuestions, passed, perQuestion };
}
