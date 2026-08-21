// Strict validation for DeepSeek responses.
// AI is an educational tutor only. It never controls quiz scoring,
// XP, achievements, completion, or asset unlocks.

export type TutorResult = {
  title: string;
  explanation: string;
  keyPoints: string[];
  example?: string;
  nextStep?: string;
};

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

export function validateTutorResult(raw: string): ValidationResult<TutorResult> {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "not_json_object" };
  }

  const obj = parsed as Record<string, unknown>;

  if (!isNonEmptyString(obj.title, 200)) {
    return { ok: false, reason: "invalid_title" };
  }
  if (!isNonEmptyString(obj.explanation, 3000)) {
    return { ok: false, reason: "invalid_explanation" };
  }
  if (
    !Array.isArray(obj.keyPoints) ||
    obj.keyPoints.length > 6 ||
    obj.keyPoints.some((p) => !isNonEmptyString(p, 500))
  ) {
    return { ok: false, reason: "invalid_keyPoints" };
  }
  if (obj.example !== undefined && !isNonEmptyString(obj.example, 1200)) {
    return { ok: false, reason: "invalid_example" };
  }
  if (obj.nextStep !== undefined && !isNonEmptyString(obj.nextStep, 800)) {
    return { ok: false, reason: "invalid_nextStep" };
  }

  return {
    ok: true,
    data: {
      title: obj.title,
      explanation: obj.explanation,
      keyPoints: obj.keyPoints as string[],
      ...(obj.example !== undefined ? { example: obj.example as string } : {}),
      ...(obj.nextStep !== undefined ? { nextStep: obj.nextStep as string } : {}),
    },
  };
}
