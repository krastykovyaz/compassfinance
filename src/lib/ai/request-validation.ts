// Shared input validation for src/app/api/ai/*/route.ts.
//
// Part 3 is explicit: "do not trust client-provided XP / achievement
// state / completion state / asset unlock state / user permissions."
// Accordingly, this only ever accepts and validates identifiers
// (assetId, lessonId, difficulty, locale) and content the LEARNER
// authored just now (their answer text). It never accepts — and would
// simply ignore if sent — any field describing progress, XP, or unlock
// status; buildLearningContext() (curriculum-context.ts) derives
// everything about the curriculum itself from the server's own registry,
// not from the request body.

import { DifficultyLevel, isDifficultyLevel } from "./difficulty";
import { isSupportedLocale } from "@/lib/i18n/translate";
import { Locale } from "@/lib/i18n/types";

export type BaseAIRequestFields = {
  assetId: string;
  lessonId: string;
  difficulty: DifficultyLevel;
  locale: Locale;
  learnerLevelLabel?: string;
  recentMistakeQuestionIds?: string[];
};

export type ValidatedRequest<T> = { ok: true; data: T } | { ok: false; error: string };

function isPlainString(value: unknown, maxLen = 200): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

/** Validates the fields every AI endpoint needs. Endpoint-specific extras
 * (e.g. `concept`, `question`, `userAnswer`) are validated separately by
 * each route so their limits/requirements stay local to where they're
 * used. */
export function validateBaseFields(body: unknown): ValidatedRequest<BaseAIRequestFields> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_body" };
  }
  const obj = body as Record<string, unknown>;

  if (!isPlainString(obj.assetId, 40)) return { ok: false, error: "invalid_assetId" };
  if (!isPlainString(obj.lessonId, 80)) return { ok: false, error: "invalid_lessonId" };
  if (!isDifficultyLevel(obj.difficulty)) return { ok: false, error: "invalid_difficulty" };

  const locale: Locale =
    typeof obj.locale === "string" && isSupportedLocale(obj.locale) ? obj.locale : "en";

  let learnerLevelLabel: string | undefined;
  if (obj.learnerLevelLabel !== undefined) {
    if (!isPlainString(obj.learnerLevelLabel, 60)) {
      return { ok: false, error: "invalid_learnerLevelLabel" };
    }
    learnerLevelLabel = obj.learnerLevelLabel;
  }

  let recentMistakeQuestionIds: string[] | undefined;
  if (obj.recentMistakeQuestionIds !== undefined) {
    if (
      !Array.isArray(obj.recentMistakeQuestionIds) ||
      obj.recentMistakeQuestionIds.length > 5 ||
      obj.recentMistakeQuestionIds.some((id) => !isPlainString(id, 80))
    ) {
      return { ok: false, error: "invalid_recentMistakeQuestionIds" };
    }
    recentMistakeQuestionIds = obj.recentMistakeQuestionIds as string[];
  }

  return {
    ok: true,
    data: {
      assetId: obj.assetId,
      lessonId: obj.lessonId,
      difficulty: obj.difficulty,
      locale,
      learnerLevelLabel,
      recentMistakeQuestionIds,
    },
  };
}

export { isPlainString };
