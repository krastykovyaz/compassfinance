import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_ORDER,
  DifficultyControllerState,
  INITIAL_DIFFICULTY_STATE,
  nextDifficultyState,
  toDifficultyLevel,
  isDifficultyLevel,
} from "./difficulty";

describe("nextDifficultyState() — deterministic progression (Part 9)", () => {
  it("starts at beginner (test 13's baseline)", () => {
    expect(INITIAL_DIFFICULTY_STATE.level).toBe("beginner");
  });

  it("advances beginner -> intermediate after 2 correct answers (test 14)", () => {
    let s = INITIAL_DIFFICULTY_STATE;
    s = nextDifficultyState(s, true);
    expect(s.level).toBe("beginner"); // only 1 correct so far
    s = nextDifficultyState(s, true);
    expect(s.level).toBe("intermediate");
    expect(s.streak).toBe(0);
  });

  it("advances intermediate -> advanced after 2 more correct answers (test 15)", () => {
    let s: DifficultyControllerState = { level: "intermediate", streak: 0 };
    s = nextDifficultyState(s, true);
    s = nextDifficultyState(s, true);
    expect(s.level).toBe("advanced");
  });

  it("never advances past advanced", () => {
    let s: DifficultyControllerState = { level: "advanced", streak: 0 };
    s = nextDifficultyState(s, true);
    s = nextDifficultyState(s, true);
    expect(s.level).toBe("advanced");
  });

  it("a wrong answer with no banked streak steps down one level (test 16)", () => {
    const s = nextDifficultyState({ level: "intermediate", streak: 0 }, false);
    expect(s.level).toBe("beginner");
    expect(s.streak).toBe(0);
  });

  it("never steps down below beginner", () => {
    const s = nextDifficultyState({ level: "beginner", streak: 0 }, false);
    expect(s.level).toBe("beginner");
  });

  it("a wrong answer after a partial streak resets the streak but keeps the level (retry at same difficulty)", () => {
    const s = nextDifficultyState({ level: "intermediate", streak: 1 }, false);
    expect(s.level).toBe("intermediate");
    expect(s.streak).toBe(0);
  });

  it("the LLM's boolean is the only input — this is a pure function with no side effects (test 18: LLM cannot directly award XP/change state)", () => {
    // nextDifficultyState has no access to progress-store, XP, or
    // anything else — it only ever transforms { level, streak } based on
    // a boolean. Demonstrated structurally: the function signature takes
    // no context beyond the two arguments below.
    const before = { level: "beginner" as const, streak: 0 };
    const after = nextDifficultyState(before, true);
    expect(before).toEqual({ level: "beginner", streak: 0 }); // untouched (pure)
    expect(after).not.toBe(before);
  });
});

describe("toDifficultyLevel() — legacy easy/medium/hard mapping", () => {
  it("maps the existing curated-question scale onto the three-tier model", () => {
    expect(toDifficultyLevel("easy")).toBe("beginner");
    expect(toDifficultyLevel("medium")).toBe("intermediate");
    expect(toDifficultyLevel("hard")).toBe("advanced");
  });
});

describe("isDifficultyLevel()", () => {
  it("accepts only the three valid levels", () => {
    for (const level of DIFFICULTY_ORDER) {
      expect(isDifficultyLevel(level)).toBe(true);
    }
    expect(isDifficultyLevel("expert")).toBe(false);
    expect(isDifficultyLevel(42)).toBe(false);
    expect(isDifficultyLevel(undefined)).toBe(false);
  });
});
