import "server-only";
import { prisma } from "@/server/db/prisma";
import { getServerLearningProgress, saveLessonStepProgress as saveLessonStepProgressRepo } from "@/server/repositories/learning-repository";
import { getAssetLearningPath } from "@/lib/learning/content";
import { XP_REWARDS } from "@/lib/learning/xp";
import { ACHIEVEMENTS, checkAchievements } from "@/lib/learning/achievements";
import { INVESTMENT_UNLOCK_STAGES, getInvestmentAccess } from "@/lib/learning/unlocks";
import { recordActivity } from "@/lib/learning/progress";
import { notifyUser } from "./notification-events";
import type { LearningProgress } from "@/lib/learning/types";

type DbTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$use" | "$extends">;
import { gradeQuiz } from "./quiz-grading";
import type { QuizAnswerInput, QuizGradeResult } from "./quiz-grading";
export type { QuizAnswerInput, QuizGradeResult } from "./quiz-grading";

// Quiz pass threshold — not something the pre-Milestone-11 client tracked
// (progression there only ever depended on lesson + quiz *completion*, not
// a score threshold), so this is a new, explicit rule introduced for
// server-side grading. 70% is a reasonable default for a 5-6 question bank;
// documented here and in the README rather than left implicit.
/** Awards an XP event idempotently. Returns true if a new event was created
 * (i.e. this call actually granted XP, as opposed to a harmless replay). */
async function awardXpOnce(
  tx: DbTransaction,
  userId: string,
  eventType: string,
  sourceId: string,
  amount: number
): Promise<boolean> {
  try {
    await tx.userXPEvent.create({ data: { userId, eventType, sourceId, amount } });
    return true;
  } catch {
    // Unique constraint on (userId, eventType, sourceId) — already awarded.
    return false;
  }
}

async function touchStreak(tx: DbTransaction, userId: string) {
  const existing = await tx.userLearningStats.findUnique({ where: { userId } });
  const next = recordActivity({
    currentStreak: existing?.currentStreak ?? 0,
    longestStreak: existing?.longestStreak ?? 0,
    lastActivityAt: existing?.lastActivityAt?.toISOString() ?? null,
  });
  await tx.userLearningStats.upsert({
    where: { userId },
    create: {
      userId,
      currentStreak: next.currentStreak,
      longestStreak: next.longestStreak,
      lastActivityAt: new Date(next.lastActivityAt),
    },
    update: {
      currentStreak: next.currentStreak,
      longestStreak: next.longestStreak,
      lastActivityAt: new Date(next.lastActivityAt),
    },
  });
}

/** Re-checks achievements and investment-unlock stages against the given
 * snapshot and persists anything newly earned. Idempotent — safe to call
 * after any progress-changing action. AI/client input never reaches this;
 * it only ever runs against a snapshot this service itself assembled. */
async function applyDerivedUnlocks(
  tx: DbTransaction,
  userId: string,
  progress: LearningProgress
): Promise<{ newAchievementIds: string[]; newAssetUnlockIds: string[] }> {
  // Clean up stale achievement rows against the same real progress snapshot
  // before checking for newly earned achievements. This prevents a legacy/mock
  // row from permanently blocking a legitimate future unlock because of the
  // userId + achievementId uniqueness constraint.
  const persistedAchievements = await tx.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true },
  });
  const invalidAchievementIds = persistedAchievements
    .map((row) => row.achievementId)
    .filter((id) => {
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      return !def || !def.isUnlocked(progress);
    });

  if (invalidAchievementIds.length > 0) {
    await tx.userAchievement.deleteMany({
      where: { userId, achievementId: { in: invalidAchievementIds } },
    });
  }

  const validPersistedAchievements = persistedAchievements
    .map((row) => row.achievementId)
    .filter((id) => !invalidAchievementIds.includes(id));

  const progressForChecks: LearningProgress = {
    ...progress,
    unlockedAchievements: validPersistedAchievements,
  };

  const newlyUnlockedAchievementIds = checkAchievements(progressForChecks);
  for (const achievementId of newlyUnlockedAchievementIds) {
    const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
    if (!def) continue;
    try {
      await tx.userAchievement.create({ data: { userId, achievementId } });
    } catch {
      continue; // already unlocked — idempotent no-op
    }
    await awardXpOnce(tx, userId, "achievement_unlocked", achievementId, def.xpReward);
  }

  // Re-derive progress including any achievements just unlocked, then
  // check investment-unlock stages against the up-to-date picture.
  const updatedAchievements = [...validPersistedAchievements, ...newlyUnlockedAchievementIds];
  const progressForUnlocks: LearningProgress = {
    ...progress,
    unlockedAchievements: updatedAchievements,
  };

  const newAssetUnlockIds: string[] = [];
  for (const stage of INVESTMENT_UNLOCK_STAGES) {
    if (getInvestmentAccess(stage.assetId, progressForUnlocks) === "UNLOCKED") {
      try {
        await tx.userAssetUnlock.create({ data: { userId, assetId: stage.assetId } });
        newAssetUnlockIds.push(stage.assetId);
      } catch {
        // already unlocked — idempotent no-op
      }
    }
  }

  return { newAchievementIds: newlyUnlockedAchievementIds, newAssetUnlockIds };
}

/** Fires the real-event notification integration (Section 1) for whatever
 * applyDerivedUnlocks() actually just granted. Runs after the transaction
 * has committed and never throws — a notification hiccup must never turn
 * into a failed lesson/quiz/trade response. */
async function notifyDerivedUnlocks(
  userId: string,
  derived: { newAchievementIds: string[]; newAssetUnlockIds: string[] }
): Promise<void> {
  for (const achievementId of derived.newAchievementIds) {
    await notifyUser(userId, "achievement_earned", achievementId);
  }
  for (const assetId of derived.newAssetUnlockIds) {
    await notifyUser(userId, "investment_unlocked", assetId);
  }
}

export async function completeLesson(userId: string, assetId: string): Promise<LearningProgress> {
  const path = getAssetLearningPath(assetId);
  if (!path) {
    throw new Error(`Unknown assetId: ${assetId}`);
  }

  let derived: { newAchievementIds: string[]; newAssetUnlockIds: string[] } = {
    newAchievementIds: [],
    newAssetUnlockIds: [],
  };
  let justCompleted = false;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.userLearningProgress.findUnique({
      where: { userId_assetId: { userId, assetId } },
    });
    const alreadyCompleted = existing?.completionState === "COMPLETED";

    await tx.userLearningProgress.upsert({
      where: { userId_assetId: { userId, assetId } },
      create: {
        userId,
        assetId,
        completionState: "COMPLETED",
        completedAt: new Date(),
      },
      update: alreadyCompleted
        ? {}
        : { completionState: "COMPLETED", completedAt: new Date() },
    });

    if (!alreadyCompleted) {
      await awardXpOnce(tx, userId, "lesson_completed", assetId, XP_REWARDS.lessonCompleted);
      await touchStreak(tx, userId);
      justCompleted = true;
    }

    const progress = await getServerLearningProgress(userId);
    derived = await applyDerivedUnlocks(tx, userId, progress);
  });

  if (justCompleted) {
    await notifyUser(userId, "learning_completed", assetId);
  }
  await notifyDerivedUnlocks(userId, derived);

  return getServerLearningProgress(userId);
}

export async function submitQuiz(
  userId: string,
  assetId: string,
  attemptId: string,
  answers: QuizAnswerInput[]
): Promise<{ grade: QuizGradeResult; progress: LearningProgress; alreadySubmitted: boolean }> {
  const path = getAssetLearningPath(assetId);
  if (!path) {
    throw new Error(`Unknown assetId: ${assetId}`);
  }

  // Server grades from the canonical answer key — the client's own
  // `passed`/`score` (if it sent any) is never read or trusted (Section 12).
  const grade = gradeQuiz(assetId, answers);

  let alreadySubmitted = false;
  let derived: { newAchievementIds: string[]; newAssetUnlockIds: string[] } = {
    newAchievementIds: [],
    newAssetUnlockIds: [],
  };

  await prisma.$transaction(async (tx) => {
    try {
      await tx.userQuizResult.create({
        data: {
          userId,
          assetId,
          attemptId,
          score: grade.score,
          totalQuestions: grade.totalQuestions,
          passed: grade.passed,
        },
      });
    } catch {
      // Same attemptId submitted twice — idempotent no-op, no duplicate XP.
      alreadySubmitted = true;
      return;
    }

    await awardXpOnce(tx, userId, "quiz_completed", assetId, XP_REWARDS.quizCompleted);
    for (const q of grade.perQuestion) {
      if (q.correct) {
        await awardXpOnce(
          tx,
          userId,
          "correct_answer",
          `${assetId}:${q.questionId}`,
          XP_REWARDS.correctQuizAnswer
        );
      }
    }
    await touchStreak(tx, userId);

    const progressSnapshot = await getServerLearningProgress(userId);
    derived = await applyDerivedUnlocks(tx, userId, progressSnapshot);
  });

  await notifyDerivedUnlocks(userId, derived);

  const progress = await getServerLearningProgress(userId);
  return { grade, progress, alreadySubmitted };
}

/** Persists lesson-step progress (how many steps into the lesson the
 * learner has read) without granting XP or marking the lesson complete —
 * distinct from completeLesson() above. Safe to call frequently/on every
 * "next" click. */
export async function saveLessonStepProgress(
  userId: string,
  assetId: string,
  stepIndex: number
): Promise<void> {
  await saveLessonStepProgressRepo(userId, assetId, stepIndex);
}

// A fixed, server-determined reward — never a client-supplied amount
// (Section 11: "client cannot submit arbitrary XP"). Practice trading
// itself (position sizing, entry/exit price, P&L) stays fully client-side
// and simulated (Section 23/28 — no real trading infra this milestone);
// this only logs the XP-worthy *event* of "a practice trade was closed".
const PRACTICE_TRADE_XP = XP_REWARDS.assetLearningPathCompleted;

/**
 * Bridges practice-trading (still local-only mechanics) into the
 * server-owned XP ledger, so XP has exactly one authoritative number for
 * authenticated users instead of a local component plus a server
 * component. `tradeId` is a client-generated idempotency key (one per
 * closed trade) — the unique (userId, eventType, tradeId) constraint on
 * UserXPEvent means retrying the same close request can't double-grant
 * XP, the same guarantee every other action in this service gets.
 */
export async function closePracticeTrade(
  userId: string,
  tradeId: string
): Promise<{ progress: LearningProgress; alreadyRecorded: boolean }> {
  let alreadyRecorded = false;

  await prisma.$transaction(async (tx) => {
    const granted = await awardXpOnce(tx, userId, "practice_trade_closed", tradeId, PRACTICE_TRADE_XP);
    if (!granted) {
      alreadyRecorded = true;
      return;
    }
    await touchStreak(tx, userId);
    const progress = await getServerLearningProgress(userId);
    await applyDerivedUnlocks(tx, userId, progress);
  });

  const progress = await getServerLearningProgress(userId);
  return { progress, alreadyRecorded };
}
