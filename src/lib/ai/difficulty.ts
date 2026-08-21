// Milestone 10, Parts 8 & 9 — the difficulty model and the deterministic
// controller around it. The LLM never decides progression; it only
// receives a difficulty level as an instruction and (for assessment)
// reports whether the answer was correct. Everything else here is a pure
// function over that boolean, with thresholds as plain constants — "the
// exact thresholds should be represented in code/configuration rather
// than hidden inside a prompt" (Part 9).

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export const DIFFICULTY_ORDER: DifficultyLevel[] = ["beginner", "intermediate", "advanced"];

/**
 * What each level means, in curriculum terms — this is the "existing
 * curriculum defines what these levels mean" requirement from Part 8.
 * It's deliberately a single shared definition (not duplicated per asset):
 * difficulty is a property of the *learning interaction*, not of any one
 * asset's content, so it belongs here rather than in each of the 13
 * content files under src/lib/learning/content/.
 */
export const DIFFICULTY_GUIDANCE: Record<DifficultyLevel, string> = {
  beginner: "Recall, identify, and explain basic facts from the lesson.",
  intermediate: "Apply a concept, interpret a simple scenario, or compare two situations.",
  advanced: "Analyze multiple factors, reason through a more complex scenario, and identify trade-offs.",
};

/** Maps the existing curated-question difficulty scale (easy/medium/hard —
 * see learning/content/types.ts's QuestionDifficulty) onto the three-tier
 * model the AI layer uses. Kept as a mapping rather than renaming
 * QuestionDifficulty everywhere, so none of the 13 existing content files
 * need to change (Part 20: "do not rewrite all course content"). */
export function toDifficultyLevel(legacy: "easy" | "medium" | "hard"): DifficultyLevel {
  if (legacy === "easy") return "beginner";
  if (legacy === "medium") return "intermediate";
  return "advanced";
}

export function isDifficultyLevel(value: unknown): value is DifficultyLevel {
  return typeof value === "string" && (DIFFICULTY_ORDER as string[]).includes(value);
}

// --- Deterministic adaptive-difficulty controller (Part 9) -----------------

/** 2 correct answers in a row advances one level — see Part 9's example. */
export const CORRECT_ANSWERS_TO_ADVANCE = 2;

export type DifficultyControllerState = {
  level: DifficultyLevel;
  /** Consecutive correct answers at the CURRENT level. Resets on any
   * level change and on any wrong answer. */
  streak: number;
};

export const INITIAL_DIFFICULTY_STATE: DifficultyControllerState = {
  level: "beginner",
  streak: 0,
};

/**
 * Pure transition function: given the current controller state and
 * whether the learner's last answer was correct, returns the next state.
 *
 * Policy (deliberately simple, per Part 9 — "do not make the first
 * version overly complicated"):
 *   - Correct: streak += 1. At CORRECT_ANSWERS_TO_ADVANCE, advance one
 *     level (capped at "advanced") and reset streak to 0.
 *   - Wrong: if this is the learner's first miss at the current level
 *     (streak was 0, i.e. they hadn't banked any progress here), step
 *     down one level (floored at "beginner") — they weren't ready for
 *     this level yet. If they'd already built up a streak, just reset it
 *     to 0 and retry at the SAME level, rather than punishing a single
 *     slip after real progress. This matches Part 9's "retry at same or
 *     lower difficulty" without needing extra configuration.
 */
export function nextDifficultyState(
  state: DifficultyControllerState,
  wasCorrect: boolean
): DifficultyControllerState {
  const currentIndex = DIFFICULTY_ORDER.indexOf(state.level);

  if (wasCorrect) {
    const streak = state.streak + 1;
    if (streak >= CORRECT_ANSWERS_TO_ADVANCE) {
      const nextIndex = Math.min(currentIndex + 1, DIFFICULTY_ORDER.length - 1);
      return { level: DIFFICULTY_ORDER[nextIndex], streak: 0 };
    }
    return { ...state, streak };
  }

  if (state.streak === 0) {
    const prevIndex = Math.max(currentIndex - 1, 0);
    return { level: DIFFICULTY_ORDER[prevIndex], streak: 0 };
  }
  return { ...state, streak: 0 };
}
