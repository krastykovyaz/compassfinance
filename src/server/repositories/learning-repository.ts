import "server-only";
import { prisma } from "@/server/db/prisma";
import type { LearningProgress } from "@/lib/learning/types";
import { getLevelFromXP } from "@/lib/learning/xp";
import { ACHIEVEMENTS } from "@/lib/learning/achievements";

// Milestone 16: practice trading is now a real, server-backed system (see
// src/lib/trading/) — PaperAccount/PaperPosition/PaperTrade, not
// localStorage. `investmentsMade` (which feeds the FIRST_INVESTMENT /
// "3 investments" achievements below) is the count of real closed
// (SELL) trades in that ledger, not the old XP-event bridge that stood
// in for it before a real trading model existed.
async function getInvestmentsMadeCount(userId: string): Promise<number> {
  return prisma.paperTrade.count({
    where: { side: "SELL", account: { userId } },
  });
}

// Milestone 19: the "Diversified" achievement requires 3 DISTINCT assets,
// not 3 trades — see achievements.ts. This is a real count of unique
// assetIds across every trade (BUY or SELL) ever made, not a proxy.
async function getDistinctAssetsInvestedCount(userId: string): Promise<number> {
  const rows = await prisma.paperTrade.findMany({
    where: { account: { userId } },
    select: { assetId: true },
    distinct: ["assetId"],
  });
  return rows.length;
}

export async function getServerLearningProgress(userId: string): Promise<LearningProgress> {
  const [xpAgg, lessons, quizzes, achievements, stats, investmentsMade, distinctAssetsInvested] =
    await Promise.all([
      prisma.userXPEvent.aggregate({ where: { userId }, _sum: { amount: true } }),
      prisma.userLearningProgress.findMany({
        where: { userId, completionState: "COMPLETED" },
        select: { assetId: true },
      }),
      prisma.userQuizResult.findMany({
        where: { userId },
        select: { score: true, assetId: true },
      }),
      prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
      prisma.userLearningStats.findUnique({ where: { userId } }),
      getInvestmentsMadeCount(userId),
      getDistinctAssetsInvestedCount(userId),
    ]);

  const totalXP = xpAgg._sum.amount ?? 0;
  const completedLessons = lessons.map((l) => l.assetId);
  // "Completed" here means submitted at least once (pass or fail) — the
  // same meaning getAssetProgressMap's quizCompleted already uses for the
  // per-asset resume state, so this doesn't introduce a second, competing
  // definition of "quiz completed" alongside it.
  const completedQuizzes = Array.from(new Set(quizzes.map((q) => q.assetId)));
  const correctAnswers = quizzes.reduce((sum, q) => sum + q.score, 0);

  const baseProgress: LearningProgress = {
    totalXP,
    level: getLevelFromXP(totalXP).level,
    lessonsCompleted: completedLessons.length,
    quizzesCompleted: quizzes.length,
    correctAnswers,
    currentStreak: stats?.currentStreak ?? 0,
    longestStreak: stats?.longestStreak ?? 0,
    assetsExplored: stats ? (JSON.parse(stats.assetsExploredSlugs) as string[]).length : 0,
    investmentsMade,
    distinctAssetsInvested,
    unlockedAchievements: [],
    completedLessons,
    completedQuizzes,
    lastActivityAt: stats?.lastActivityAt?.toISOString() ?? null,
  };

  // Achievement completion is persisted per user, but the predicate is still
  // the final validity check. This prevents stale/mock rows from making an
  // achievement appear earned after authentication while preserving the
  // existing achievement source of truth.
  const persistedAchievementIds = new Set(achievements.map((a) => a.achievementId));
  const validAchievementIds = ACHIEVEMENTS
    .filter((achievement) => persistedAchievementIds.has(achievement.id) && achievement.isUnlocked(baseProgress))
    .map((achievement) => achievement.id);

  return {
    ...baseProgress,
    unlockedAchievements: validAchievementIds,
  };
}

export async function recordAssetView(userId: string, assetId: string): Promise<void> {
  const existing = await prisma.userLearningStats.findUnique({ where: { userId } });
  const slugs = new Set<string>(
    existing ? (JSON.parse(existing.assetsExploredSlugs) as string[]) : []
  );
  slugs.add(assetId);
  await prisma.userLearningStats.upsert({
    where: { userId },
    create: { userId, assetsExploredSlugs: JSON.stringify([...slugs]) },
    update: { assetsExploredSlugs: JSON.stringify([...slugs]) },
  });
}

export type AssetProgressDTO = {
  stepIndex: number;
  lessonCompleted: boolean;
  quizCompleted: boolean;
};

/** Per-asset UI-resume state (Milestone 11.1, Section 9) — lets a page
 * restore "which lesson step was I on" / "did I already finish the quiz"
 * after a refresh/new session, without needing per-question answer
 * history (which is allowed to stay session-only — Section 10: "the
 * client can temporarily hold answers while the quiz is active"). */
export async function getAssetProgressMap(
  userId: string
): Promise<Record<string, AssetProgressDTO>> {
  const [lessons, quizAssetIds] = await Promise.all([
    prisma.userLearningProgress.findMany({ where: { userId } }),
    prisma.userQuizResult.findMany({ where: { userId }, select: { assetId: true } }),
  ]);
  const quizCompletedSet = new Set(quizAssetIds.map((q) => q.assetId));

  const result: Record<string, AssetProgressDTO> = {};
  for (const l of lessons) {
    result[l.assetId] = {
      stepIndex: l.stepIndex,
      lessonCompleted: l.completionState === "COMPLETED",
      quizCompleted: quizCompletedSet.has(l.assetId),
    };
  }
  // An asset can have a quiz result without an explicit progress row in
  // rare edge cases (shouldn't normally happen since completeLesson always
  // upserts one first) — make sure quizCompleted still shows up either way.
  for (const assetId of quizCompletedSet) {
    if (!result[assetId]) {
      result[assetId] = { stepIndex: 0, lessonCompleted: false, quizCompleted: true };
    }
  }
  return result;
}

/** Persists "how far through the lesson steps" without marking the lesson
 * complete — a lightweight, frequently-called progress checkpoint distinct
 * from completeLesson()'s XP-granting transition. */
export async function saveLessonStepProgress(
  userId: string,
  assetId: string,
  stepIndex: number
): Promise<void> {
  await prisma.userLearningProgress.upsert({
    where: { userId_assetId: { userId, assetId } },
    create: { userId, assetId, stepIndex, lastActivityAt: new Date() },
    update: { stepIndex, lastActivityAt: new Date() },
  });
}
