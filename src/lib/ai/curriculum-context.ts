// Assembles the "canonical learning context" the milestone brief requires
// (Part 4) from the EXISTING content registry
// (src/lib/learning/content/index.ts) — never from client-supplied
// content. The client only ever sends identifiers (assetId, lessonId,
// difficulty, locale) plus the learner's own answer text; every fact
// about the curriculum in the resulting context is looked up here,
// server-side, from data Compass already trusts.
//
// This is also where Part 5 ("do not send unnecessary user data") and
// Part 17 ("do not send the entire course... build a compact context")
// are enforced structurally: LearningContext's shape has no room for a
// wallet address, balance, or full course dump, because nothing here ever
// reads those fields off the caller's request body in the first place.

import { getAssetLearningPath } from "@/lib/learning/content";
import { getLocalizedAssetLearningPath } from "@/lib/learning/content/localization";
import { AssetLearningPath, LessonContent } from "@/lib/learning/content/types";
import { Locale } from "@/lib/i18n/types";
import { DifficultyLevel, DIFFICULTY_GUIDANCE } from "./difficulty";

export type LearningContext = {
  assetId: string;
  assetTitle: string;
  category: string;
  lessonId: string;
  lessonTitle: string;
  /** The single lesson's own objective, plus any path-level objectives
   * (Part 20's `learningObjectives`, or a derived fallback — see
   * deriveObjectives() below). */
  objectives: string[];
  /** Deduplicated concept list for the whole path — Part 20's `concepts`,
   * or derived from lessons' keyTakeaways when absent. Capped to keep the
   * prompt compact (Part 17). */
  concepts: string[];
  /** The canonical lesson body the LLM must stay grounded in. */
  canonicalExplanation: string;
  difficulty: DifficultyLevel;
  difficultyGuidance: string;
  locale: Locale;
  /** Coarse gamification level label only (e.g. "Level 3 · Explorer") —
   * never XP totals, streaks, or anything else from ProgressState. */
  learnerLevelLabel?: string;
  /** Up to 3 recent WRONG curated-answer prompts for this asset, as plain
   * question text — helps the AI focus explanations/questions on weak
   * spots. Never includes the learner's actual free-text answers from
   * past attempts, only which curated questions they missed. */
  recentMistakes?: string[];
  /** Deterministic, code-derived description of what completes this path
   * — informational only; the LLM cannot use it to decide completion
   * itself (see describeCompletionCriteria's own note). */
  completionCriteria: string;
};

const MAX_CONCEPTS = 8;
const MAX_RECENT_MISTAKES = 3;

function deriveObjectives(path: AssetLearningPath, lesson: LessonContent): string[] {
  const pathLevel = path.learningObjectives ?? [];
  // The lesson's own objective always comes first — it's the most
  // specific, and the one this particular request is actually about.
  return Array.from(new Set([lesson.objective, ...pathLevel])).slice(0, 6);
}

function deriveConcepts(path: AssetLearningPath): string[] {
  if (path.concepts && path.concepts.length > 0) return path.concepts.slice(0, MAX_CONCEPTS);
  // Fallback: pull short phrases out of every lesson's keyTakeaways. Not
  // as clean as a hand-curated concept list, but good enough grounding
  // for the 12 asset paths that haven't been given an explicit one yet
  // (Part 20 — reuse existing fields rather than rewriting content).
  const fromTakeaways = path.lessons.flatMap((l) => l.keyTakeaways);
  return Array.from(new Set(fromTakeaways)).slice(0, MAX_CONCEPTS);
}

/**
 * Builds a LearningContext for one lesson. Returns null if the
 * assetId/lessonId pair doesn't exist in the canonical registry — callers
 * (the API routes) must reject the request in that case rather than
 * inventing a context, since an unknown id could only come from a
 * tampered or buggy client (Part 3: "do not trust client-provided...
 * state").
 */
export function buildLearningContext(params: {
  assetId: string;
  lessonId: string;
  difficulty: DifficultyLevel;
  locale: Locale;
  learnerLevelLabel?: string;
  recentMistakeQuestionIds?: string[];
}): LearningContext | null {
  const rawPath = getAssetLearningPath(params.assetId);
  if (!rawPath) return null;

  const path = getLocalizedAssetLearningPath(rawPath, params.locale);
  const lesson = path.lessons.find((l) => l.id === params.lessonId);
  if (!lesson) return null;


  const recentMistakes = (params.recentMistakeQuestionIds ?? [])
    .map((id) => path.quizQuestions.find((q) => q.id === id)?.question)
    .filter((q): q is string => Boolean(q))
    .slice(0, MAX_RECENT_MISTAKES);

  return {
    assetId: path.assetId,
    assetTitle: path.title,
    category: path.category,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    objectives: deriveObjectives(path, lesson),
    concepts: deriveConcepts(path),
    canonicalExplanation: lesson.explanation,
    difficulty: params.difficulty,
    difficultyGuidance: DIFFICULTY_GUIDANCE[params.difficulty],
    locale: params.locale,
    learnerLevelLabel: params.learnerLevelLabel,
    recentMistakes: recentMistakes.length > 0 ? recentMistakes : undefined,
    completionCriteria: `Complete all ${path.lessons.length} lessons and answer all ${path.quizQuestions.length} quiz questions.`,
  };
}
