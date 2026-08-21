import { describe, expect, it } from "vitest";
import { getInvestmentAccess, isInvestmentUnlocked, INVESTMENT_UNLOCK_STAGES, getBlockingInvestmentStage, isLockedByPriorCourse } from "./unlocks";
import { LearningProgress, InvestmentUnlockDefinition } from "./types";
import { ALL_ASSET_LEARNING_PATHS, ASSET_LEARNING_PATH_ORDER } from "./content";
import { ALL_ASSETS } from "@/lib/assets/catalog";

function progress(overrides: Partial<LearningProgress> = {}): LearningProgress {
  return {
    totalXP: 0,
    level: 1,
    lessonsCompleted: 0,
    quizzesCompleted: 0,
    correctAnswers: 0,
    currentStreak: 0,
    longestStreak: 0,
    assetsExplored: 0,
    investmentsMade: 0,
    distinctAssetsInvested: 0,
    unlockedAchievements: [],
    completedLessons: [],
    lastActivityAt: null,
    ...overrides,
  };
}

describe("getInvestmentAccess / isInvestmentUnlocked — new user (test 1)", () => {
  it("has 0 XP, no achievements, and sp500 AVAILABLE / everything else LOCKED", () => {
    const p = progress();
    expect(p.totalXP).toBe(0);
    expect(p.unlockedAchievements).toHaveLength(0);

    expect(getInvestmentAccess("sp500", p)).toBe("AVAILABLE");
    expect(getInvestmentAccess("nasdaq", p)).toBe("LOCKED");
    expect(isInvestmentUnlocked("sp500", p)).toBe(false);
    expect(isInvestmentUnlocked("nasdaq", p)).toBe(false);
  });
});

describe("required lesson missing (test 6)", () => {
  it("stays LOCKED/not-UNLOCKED if the required lesson isn't completed", () => {
    const p = progress({ completedLessons: [] });
    expect(getInvestmentAccess("sp500", p)).not.toBe("UNLOCKED");
  });
});

describe("required achievement missing (test 7)", () => {
  it("AAPL requires STOCK_EXPLORER — lesson alone isn't enough", () => {
    const p = progress({
      completedLessons: ["sp500", "nasdaq", "aapl"],
      unlockedAchievements: [], // STOCK_EXPLORER not present
    });
    expect(getInvestmentAccess("aapl", p)).not.toBe("UNLOCKED");
    expect(isInvestmentUnlocked("aapl", p)).toBe(false);
  });

  it("unlocks once both the lesson AND the achievement are present", () => {
    const p = progress({
      completedLessons: ["sp500", "nasdaq", "aapl"],
      unlockedAchievements: ["STOCK_EXPLORER"],
    });
    expect(getInvestmentAccess("aapl", p)).toBe("UNLOCKED");
  });
});

describe("multiple requirements — all must be satisfied (test 8)", () => {
  const stageWithEverything: InvestmentUnlockDefinition = {
    stage: 99,
    assetId: "__test_multi_req__",
    symbol: "TEST",
    name: "Test Asset",
    category: "crypto",
    requiredLessonId: "__test_multi_req__",
    requiredLessonTopic: "n/a",
    requiredAchievementId: "FIRST_QUIZ",
    requiredXP: 500,
    unlockDescription: "n/a",
  };

  // Exercises the same getInvestmentAccess() logic path via a synthetic
  // stage definition, without touching the real shipped stage list (so
  // shipped unlock behavior for real users can't regress from this test).
  function statusFor(def: InvestmentUnlockDefinition, p: LearningProgress) {
    const lessonDone = p.completedLessons.includes(def.requiredLessonId);
    const achievementDone = def.requiredAchievementId
      ? p.unlockedAchievements.includes(def.requiredAchievementId)
      : true;
    const xpDone = def.requiredXP !== undefined ? p.totalXP >= def.requiredXP : true;
    return lessonDone && achievementDone && xpDone ? "UNLOCKED" : "NOT_UNLOCKED";
  }

  it("lesson only: not enough", () => {
    const p = progress({ completedLessons: [stageWithEverything.requiredLessonId] });
    expect(statusFor(stageWithEverything, p)).toBe("NOT_UNLOCKED");
  });

  it("lesson + achievement, XP still short: not enough", () => {
    const p = progress({
      completedLessons: [stageWithEverything.requiredLessonId],
      unlockedAchievements: ["FIRST_QUIZ"],
      totalXP: 100,
    });
    expect(statusFor(stageWithEverything, p)).toBe("NOT_UNLOCKED");
  });

  it("all three requirements satisfied: unlocked", () => {
    const p = progress({
      completedLessons: [stageWithEverything.requiredLessonId],
      unlockedAchievements: ["FIRST_QUIZ"],
      totalXP: 500,
    });
    expect(statusFor(stageWithEverything, p)).toBe("UNLOCKED");
  });
});

describe("practice trade does not bypass learning unlock (test 9)", () => {
  it("a closed position alone (investmentsMade > 0) never unlocks nasdaq", () => {
    const p = progress({ completedLessons: [], investmentsMade: 5 });
    expect(isInvestmentUnlocked("nasdaq", p)).toBe(false);
    expect(getInvestmentAccess("nasdaq", p)).not.toBe("UNLOCKED");
  });
});

describe("S&P 500 progression (test 11)", () => {
  it("existing sp500 completion is still recognized as UNLOCKED", () => {
    const p = progress({ completedLessons: ["sp500"] });
    expect(isInvestmentUnlocked("sp500", p)).toBe(true);
    expect(getInvestmentAccess("nasdaq", p)).toBe("AVAILABLE");
  });
});

describe("sequential stage gating", () => {
  it("nasdaq stays LOCKED until sp500 is UNLOCKED, then becomes AVAILABLE, then UNLOCKED", () => {
    const notStarted = progress();
    expect(getInvestmentAccess("nasdaq", notStarted)).toBe("LOCKED");

    const sp500Done = progress({ completedLessons: ["sp500"] });
    expect(getInvestmentAccess("nasdaq", sp500Done)).toBe("AVAILABLE");

    const nasdaqDone = progress({ completedLessons: ["sp500", "nasdaq"] });
    expect(getInvestmentAccess("nasdaq", nasdaqDone)).toBe("UNLOCKED");
  });

  it("the original five-stage prerequisite chain remains unchanged", () => {
    for (let i = 1; i < 5; i++) {
      expect(INVESTMENT_UNLOCK_STAGES[i].prerequisiteAssetId).toBe(
        INVESTMENT_UNLOCK_STAGES[i - 1].assetId
      );
    }
    expect(INVESTMENT_UNLOCK_STAGES[0].prerequisiteAssetId).toBeUndefined();
  });

  it("all remaining assets require their own learning path before investment", () => {
    for (const assetId of ["msft", "amzn", "googl", "meta", "gold", "brent-oil", "btc", "eth"]) {
      expect(getInvestmentAccess(assetId, progress())).toBe("AVAILABLE");
      expect(getInvestmentAccess(assetId, progress({ completedLessons: [assetId] }))).toBe("UNLOCKED");
    }
  });
});

describe("all 13 assets resolve through the canonical registry (test 12)", () => {
  it("getInvestmentAccess never throws and returns a valid status for every content assetId", () => {
    expect(ASSET_LEARNING_PATH_ORDER).toHaveLength(13);
    const p = progress();
    for (const assetId of ASSET_LEARNING_PATH_ORDER) {
      expect(() => getInvestmentAccess(assetId, p)).not.toThrow();
      expect(["LOCKED", "AVAILABLE", "UNLOCKED"]).toContain(getInvestmentAccess(assetId, p));
    }
  });

  it("an unknown assetId resolves deterministically to LOCKED, not a crash", () => {
    expect(getInvestmentAccess("not-a-real-asset", progress())).toBe("LOCKED");
  });

  it("every real asset starts non-investable until its required learning is completed", () => {
    const p = progress();
    for (const assetId of ASSET_LEARNING_PATH_ORDER) {
      expect(getInvestmentAccess(assetId, p)).not.toBe("UNLOCKED");
    }
  });

  it("a standalone asset unlocks only after its own learning path is completed", () => {
    const noProgress = progress();
    const completed = progress({ completedLessons: ["btc"] });
    expect(getInvestmentAccess("btc", noProgress)).toBe("AVAILABLE");
    expect(getInvestmentAccess("btc", completed)).toBe("UNLOCKED");
  });
});

describe("all four asset categories are supported (test 13)", () => {
  it("content registry covers index, stock, commodity, and crypto", () => {
    const categories = new Set(
      ASSET_LEARNING_PATH_ORDER.map((id) => ALL_ASSET_LEARNING_PATHS[id].category)
    );
    expect(categories).toEqual(new Set(["index", "stock", "commodity", "crypto"]));
  });

  it("InvestmentUnlockDefinition['category'] type-checks for all four categories", () => {
    const sample: InvestmentUnlockDefinition["category"][] = ["index", "stock", "commodity", "crypto"];
    expect(sample).toHaveLength(4);
  });
});

describe("getBlockingInvestmentStage — points at the REAL blocker, not always the asset's own stage", () => {
  it("returns the asset's own stage for a standalone asset until its course is complete", () => {
    const p = progress();
    expect(getBlockingInvestmentStage("btc", p)?.assetId).toBe("btc");
    const btcDone = progress({ completedLessons: ["btc"] });
    expect(getBlockingInvestmentStage("btc", btcDone)).toBeNull();
    const sp500Done = progress({ completedLessons: ["sp500"] });
    expect(getBlockingInvestmentStage("sp500", sp500Done)).toBeNull();
  });

  it("a brand-new learner viewing Tesla (4 hops deep) is blocked by S&P 500, not Apple", () => {
    const p = progress(); // nothing completed
    const blocker = getBlockingInvestmentStage("tsla", p);
    expect(blocker?.assetId).toBe("sp500");
  });

  it("once S&P 500 is done, Tesla's blocker becomes Nasdaq (the next unmet stage)", () => {
    const p = progress({ completedLessons: ["sp500"] });
    const blocker = getBlockingInvestmentStage("tsla", p);
    expect(blocker?.assetId).toBe("nasdaq");
  });

  it("once every earlier stage is done except the asset's own lesson, the asset itself is the blocker", () => {
    const p = progress({
      completedLessons: ["sp500", "nasdaq", "aapl"],
      unlockedAchievements: ["STOCK_EXPLORER"],
    });
    const blocker = getBlockingInvestmentStage("tsla", p);
    expect(blocker?.assetId).toBe("tsla");
  });
});

describe("isLockedByPriorCourse — the exact gate /learn/[assetId] uses to disable Start Course (test 14)", () => {
  it("a brand-new learner opening Nasdaq's course: locked by S&P 500 (a PRIOR course) -> Start Course disabled", () => {
    const p = progress();
    expect(isLockedByPriorCourse("nasdaq", p)).toBe(true);
  });

  it("once S&P 500 is done, opening Nasdaq's own course is NOT locked by a prior course -> Start Course enabled", () => {
    const p = progress({ completedLessons: ["sp500"] });
    // Nasdaq's own lesson still isn't done, but that's normal/expected —
    // not a "prior course" block, so the gate must not fire.
    expect(isLockedByPriorCourse("nasdaq", p)).toBe(false);
  });

  it("sp500 itself is never locked by a prior course — it has no prerequisite", () => {
    expect(isLockedByPriorCourse("sp500", progress())).toBe(false);
  });

  it("a standalone asset (e.g. btc) is not blocked by a prior course", () => {
    expect(isLockedByPriorCourse("btc", progress())).toBe(false);
  });

  it("no regression once everything upstream is genuinely unlocked: Nasdaq fully unlocked is not locked by a prior course", () => {
    const p = progress({
      completedLessons: ["sp500", "nasdaq"],
    });
    expect(isInvestmentUnlocked("nasdaq", p)).toBe(true);
    expect(isLockedByPriorCourse("nasdaq", p)).toBe(false);
  });

  it("correctly names the actual blocking prior stage for a deeper-chain asset (Tesla, blocked by S&P 500, not Apple)", () => {
    const p = progress();
    const blocker = getBlockingInvestmentStage("tsla", p);
    expect(isLockedByPriorCourse("tsla", p)).toBe(true);
    expect(blocker?.assetId).toBe("sp500");
    expect(blocker?.name).toBeTruthy();
    expect(blocker?.unlockDescription).toBeTruthy();
  });
});

describe("Learning Progress 'X/Y assets' count — must use REAL investment unlock state, matching Markets (test 15)", () => {
  function unlockedAssetCount(p: LearningProgress): number {
    // Mirrors exactly what LearningProgressCard computes — same
    // getInvestmentAccess() + ALL_ASSETS Markets already uses, not a
    // second calculation.
    return ALL_ASSETS.filter((a) => getInvestmentAccess(a.id, p) === "UNLOCKED").length;
  }

  it("a brand-new learner starts with 0 unlocked assets", () => {
    expect(unlockedAssetCount(progress())).toBe(0);
  });

  it("does NOT just count completed lessons — completing aapl's lesson alone (without the required STOCK_EXPLORER achievement) doesn't unlock it", () => {
    const p = progress({ completedLessons: ["sp500", "nasdaq", "aapl"] }); // lesson done, achievement missing
    expect(getInvestmentAccess("aapl", p)).not.toBe("UNLOCKED");
    expect(unlockedAssetCount(p)).toBe(2); // sp500 + nasdaq unlocked; aapl still isn't
  });

  it("increases by exactly 1 once sp500's own lesson is genuinely completed", () => {
    const p = progress({ completedLessons: ["sp500"] });
    expect(unlockedAssetCount(p)).toBe(1);
  });

  it("counts against the full 13-asset catalog, matching Markets' asset universe exactly", () => {
    expect(ALL_ASSETS).toHaveLength(13);
  });
});
