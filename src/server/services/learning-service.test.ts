import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningProgress } from "@/lib/learning/types";

vi.mock("server-only", () => ({}));

const getServerLearningProgress = vi.fn();
const saveLessonStepProgress = vi.fn();
vi.mock("@/server/repositories/learning-repository", () => ({
  getServerLearningProgress: (...args: unknown[]) => getServerLearningProgress(...args),
  saveLessonStepProgress: (...args: unknown[]) => saveLessonStepProgress(...args),
}));

const notifyUser = vi.fn();
vi.mock("./notification-events", () => ({
  notifyUser: (...args: unknown[]) => notifyUser(...args),
}));

// A minimal, in-memory fake of the Prisma models completeLesson() touches
// inside its transaction. Real predicates from achievements.ts/unlocks.ts
// run unmocked against whatever LearningProgress the test feeds in via the
// mocked getServerLearningProgress() above — this is testing the real
// event -> notifyUser wiring, not re-testing achievement/unlock logic
// itself (that's already covered by achievements.test.ts/unlocks.test.ts).
type FakeDB = {
  learningProgress: Map<string, { completionState: string }>; // key: userId:assetId
  xpEvents: Set<string>; // key: userId:eventType:sourceId
  stats: Map<string, { currentStreak: number; longestStreak: number; lastActivityAt: string | null }>;
  achievements: Set<string>; // key: userId:achievementId
  assetUnlocks: Set<string>; // key: userId:assetId
};

function createFakeTx(db: FakeDB) {
  return {
    userLearningProgress: {
      findUnique: async ({ where }: { where: { userId_assetId: { userId: string; assetId: string } } }) => {
        const { userId, assetId } = where.userId_assetId;
        const row = db.learningProgress.get(`${userId}:${assetId}`);
        return row ? { completionState: row.completionState } : null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_assetId: { userId: string; assetId: string } };
        create: { completionState: string };
        update: Record<string, unknown>;
      }) => {
        const { userId, assetId } = where.userId_assetId;
        const k = `${userId}:${assetId}`;
        const existing = db.learningProgress.get(k);
        db.learningProgress.set(k, existing ? { ...existing, ...update } : { ...create });
      },
    },
    userXPEvent: {
      create: async ({ data }: { data: { userId: string; eventType: string; sourceId: string } }) => {
        const k = `${data.userId}:${data.eventType}:${data.sourceId}`;
        if (db.xpEvents.has(k)) throw new Error("Unique constraint failed");
        db.xpEvents.add(k);
      },
    },
    userLearningStats: {
      findUnique: async ({ where }: { where: { userId: string } }) => db.stats.get(where.userId) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: { userId: string };
        create: { currentStreak: number; longestStreak: number; lastActivityAt: Date };
      }) => {
        db.stats.set(where.userId, {
          currentStreak: create.currentStreak,
          longestStreak: create.longestStreak,
          lastActivityAt: create.lastActivityAt.toISOString(),
        });
      },
    },
    userAchievement: {
      findMany: async ({ where }: { where: { userId: string } }) => {
        return [...db.achievements]
          .filter((k) => k.startsWith(`${where.userId}:`))
          .map((k) => ({ achievementId: k.split(":")[1] }));
      },
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: { userId: string; achievementId: string } }) => {
        const k = `${data.userId}:${data.achievementId}`;
        if (db.achievements.has(k)) throw new Error("Unique constraint failed");
        db.achievements.add(k);
      },
    },
    userAssetUnlock: {
      create: async ({ data }: { data: { userId: string; assetId: string } }) => {
        const k = `${data.userId}:${data.assetId}`;
        if (db.assetUnlocks.has(k)) throw new Error("Unique constraint failed");
        db.assetUnlocks.add(k);
      },
    },
  };
}

function emptyDb(): FakeDB {
  return {
    learningProgress: new Map(),
    xpEvents: new Set(),
    stats: new Map(),
    achievements: new Set(),
    assetUnlocks: new Set(),
  };
}

let db = emptyDb();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(createFakeTx(db)),
  },
}));

import { completeLesson } from "./learning-service";

function progress(overrides: Partial<LearningProgress>): LearningProgress {
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

beforeEach(() => {
  vi.clearAllMocks();
  db = emptyDb();
});

describe("completeLesson — real event, deduped at the source", () => {
  it("first-time completion notifies learning_completed for the real asset", async () => {
    getServerLearningProgress.mockResolvedValue(
      progress({ lessonsCompleted: 1, completedLessons: ["sp500"] })
    );

    await completeLesson("user-1", "sp500");

    expect(notifyUser).toHaveBeenCalledWith("user-1", "learning_completed", "sp500");
  });

  it("does NOT re-notify learning_completed for a lesson already completed", async () => {
    db.learningProgress.set("user-1:sp500", { completionState: "COMPLETED" });
    // Everything this progress snapshot would newly unlock is pre-seeded
    // as already granted too, so nothing here is a "first time" for
    // anything — this is the "replay of an already-processed event"
    // duplicate-prevention case.
    db.achievements.add("user-1:FIRST_LESSON");
    db.achievements.add("user-1:MARKET_BASICS");
    db.achievements.add("user-1:INDEX_EXPLORER");
    db.assetUnlocks.add("user-1:sp500");
    getServerLearningProgress.mockResolvedValue(
      progress({
        lessonsCompleted: 1,
        completedLessons: ["sp500"],
        unlockedAchievements: ["FIRST_LESSON", "MARKET_BASICS", "INDEX_EXPLORER"],
      })
    );

    await completeLesson("user-1", "sp500");

    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("a newly-unlocked investment fires investment_unlocked for that real asset", async () => {
    getServerLearningProgress.mockResolvedValue(
      progress({ lessonsCompleted: 1, completedLessons: ["sp500"] })
    );

    await completeLesson("user-1", "sp500");

    // sp500's own investment-unlock stage requires only its own lesson
    // (no prerequisite asset) — completing it for the first time unlocks
    // sp500 investing in the same call.
    expect(notifyUser).toHaveBeenCalledWith("user-1", "investment_unlocked", "sp500");
  });

  it("a newly-earned achievement fires achievement_earned with a real achievement id", async () => {
    getServerLearningProgress.mockResolvedValue(
      progress({ lessonsCompleted: 1, completedLessons: ["sp500"] })
    );

    await completeLesson("user-1", "sp500");

    expect(notifyUser).toHaveBeenCalledWith("user-1", "achievement_earned", expect.any(String));
  });
});
