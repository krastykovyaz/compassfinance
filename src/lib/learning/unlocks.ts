import type {
  InvestmentAccessStatus,
  InvestmentUnlockDefinition,
  LearningProgress,
} from "./types";

// Centralized INVESTMENT-access progression — "is the user allowed to
// invest in this asset yet?" This is deliberately NOT the same question as
// "can the user learn about this asset?" (see learning/access.ts for that).
//
// Milestone 8 consolidated two independent unlock mechanisms into this
// file. Milestone 8.1 went a step further: it turned out this file's own
// naming (getAssetUnlockStatus, isAssetUnlocked, AssetUnlockStatus) was
// itself ambiguous enough that /learn/[assetId]/page.tsx used its LOCKED
// status to block lesson *content*, not just investing — i.e. the
// investment-unlock engine was quietly acting as a learning-access gate
// too. Renaming everything here to say "investment" explicitly (and
// introducing learning/access.ts as its own, separate, always-permissive
// engine) makes that kind of accidental coupling harder to reintroduce.
//
// Every canonical asset has an investment-unlock stage. Learning content
// remains independently available according to learning/access.ts, while
// investment access stays locked until that asset's required learning stage
// is completed. The five original sequential stages keep their existing
// prerequisite chain; the remaining assets have no prior-course prerequisite
// and become investment-available only after their own course is completed.

export const INVESTMENT_UNLOCK_STAGES: InvestmentUnlockDefinition[] = [
  {
    stage: 1,
    assetId: "sp500",
    symbol: "SPX",
    name: "S&P 500",
    category: "index",
    requiredLessonId: "sp500",
    requiredLessonTopic: "What is a market index?",
    unlockDescription: "Learn what a market index is and how the S&P 500 works.",
  },
  {
    stage: 2,
    assetId: "nasdaq",
    symbol: "NDX",
    name: "Nasdaq 100",
    category: "index",
    requiredLessonId: "nasdaq",
    requiredLessonTopic: "Growth, technology and volatility",
    prerequisiteAssetId: "sp500",
    unlockDescription: "Complete the S&P 500 learning path to unlock Nasdaq 100 investing.",
  },
  {
    stage: 3,
    assetId: "aapl",
    symbol: "AAPL",
    name: "Apple Inc.",
    category: "stock",
    requiredLessonId: "aapl",
    requiredLessonTopic: "How individual stocks work",
    requiredAchievementId: "STOCK_EXPLORER",
    prerequisiteAssetId: "nasdaq",
    unlockDescription: "Complete the Nasdaq 100 learning path to unlock Apple investing.",
  },
  {
    stage: 4,
    assetId: "tsla",
    symbol: "TSLA",
    name: "Tesla Inc.",
    category: "stock",
    requiredLessonId: "tsla",
    requiredLessonTopic: "Understanding volatility and company-specific risk",
    prerequisiteAssetId: "aapl",
    unlockDescription: "Complete the Apple learning path to unlock Tesla investing.",
  },
  {
    stage: 5,
    assetId: "nvda",
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    category: "stock",
    requiredLessonId: "nvda",
    requiredLessonTopic: "Technology, AI and semiconductor exposure",
    prerequisiteAssetId: "tsla",
    unlockDescription: "Complete the Tesla learning path to unlock NVIDIA investing.",
  },  {
    stage: 6,
    assetId: "msft",
    symbol: "MSFT",
    name: "Microsoft Corp.",
    category: "stock",
    requiredLessonId: "msft",
    requiredLessonTopic: "How Microsoft fits into the stock market",
    unlockDescription: "Complete the Microsoft learning path to unlock Microsoft investing.",
  },
  {
    stage: 7,
    assetId: "amzn",
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    category: "stock",
    requiredLessonId: "amzn",
    requiredLessonTopic: "How Amazon fits into the stock market",
    unlockDescription: "Complete the Amazon learning path to unlock Amazon investing.",
  },
  {
    stage: 8,
    assetId: "googl",
    symbol: "GOOGL",
    name: "Alphabet Inc. (Google)",
    category: "stock",
    requiredLessonId: "googl",
    requiredLessonTopic: "How Alphabet fits into the stock market",
    unlockDescription: "Complete the Alphabet learning path to unlock Alphabet investing.",
  },
  {
    stage: 9,
    assetId: "meta",
    symbol: "META",
    name: "Meta Platforms Inc.",
    category: "stock",
    requiredLessonId: "meta",
    requiredLessonTopic: "How Meta fits into the stock market",
    unlockDescription: "Complete the Meta learning path to unlock Meta investing.",
  },
  {
    stage: 10,
    assetId: "gold",
    symbol: "GOLD",
    name: "Gold",
    category: "commodity",
    requiredLessonId: "gold",
    requiredLessonTopic: "How gold markets work",
    unlockDescription: "Complete the Gold learning path to unlock Gold investing.",
  },
  {
    stage: 11,
    assetId: "brent-oil",
    symbol: "BRENT",
    name: "Brent Crude Oil",
    category: "commodity",
    requiredLessonId: "brent-oil",
    requiredLessonTopic: "How crude oil markets work",
    unlockDescription: "Complete the Brent Crude Oil learning path to unlock oil investing.",
  },
  {
    stage: 12,
    assetId: "btc",
    symbol: "BTC",
    name: "Bitcoin",
    category: "crypto",
    requiredLessonId: "btc",
    requiredLessonTopic: "How Bitcoin works",
    unlockDescription: "Complete the Bitcoin learning path to unlock Bitcoin investing.",
  },
  {
    stage: 13,
    assetId: "eth",
    symbol: "ETH",
    name: "Ethereum",
    category: "crypto",
    requiredLessonId: "eth",
    requiredLessonTopic: "How Ethereum works",
    unlockDescription: "Complete the Ethereum learning path to unlock Ethereum investing.",
  },
];

/**
 * Walks a stage's prerequisite chain to find the ONE stage actually
 * blocking investment access right now — e.g. for Tesla (needs Apple,
 * which needs Nasdaq, which needs S&P 500), if the learner hasn't even
 * done S&P 500 yet, this returns the S&P 500 stage, not Tesla's own or
 * Apple's. Returns null when the asset isn't gated at all, or is already
 * UNLOCKED (nothing blocking it).
 *
 * Used by the asset entry screen (Milestone 21) to point the learner at
 * the CORRECT next course to complete, rather than always pointing at
 * the current asset's own lesson regardless of which prerequisite is
 * actually unmet.
 */
export function getBlockingInvestmentStage(
  assetId: string,
  progress: LearningProgress
): InvestmentUnlockDefinition | null {
  const stage = getInvestmentUnlockStage(assetId);
  if (!stage) return null;
  if (getInvestmentAccess(assetId, progress) === "UNLOCKED") return null;

  // Build the chain from the root prerequisite down to this asset (e.g.
  // for tsla: [sp500, nasdaq, aapl, tsla]), then walk it earliest-first
  // and return the FIRST stage whose own requirements aren't met yet —
  // that's the genuine blocker, since nothing later in the chain can
  // unlock while an earlier link is still missing.
  const chain: InvestmentUnlockDefinition[] = [];
  let cur: InvestmentUnlockDefinition | undefined = stage;
  while (cur) {
    chain.unshift(cur);
    cur = cur.prerequisiteAssetId ? getInvestmentUnlockStage(cur.prerequisiteAssetId) : undefined;
  }

  for (const s of chain) {
    const lessonDone = progress.completedLessons.includes(s.requiredLessonId);
    const achievementDone = s.requiredAchievementId
      ? progress.unlockedAchievements.includes(s.requiredAchievementId)
      : true;
    const xpDone = s.requiredXP !== undefined ? progress.totalXP >= s.requiredXP : true;
    if (!lessonDone || !achievementDone || !xpDone) return s;
  }

  // Every stage's own requirements are met but getInvestmentAccess still
  // said not-UNLOCKED above — shouldn't happen given how that function is
  // defined, but return the asset's own stage rather than null so the
  // caller never silently loses the lock explanation.
  return stage;
}

/**
 * True only when a PRIOR course (not this asset's own lesson) is the
 * reason investing is still locked — the exact condition
 * /learn/[assetId]/page.tsx uses to decide whether to show the course
 * gate and disable Start Course. Pulled out as its own pure predicate so
 * it's directly unit-testable without mounting the page component.
 */
export function isLockedByPriorCourse(assetId: string, progress: LearningProgress): boolean {
  const blocker = getBlockingInvestmentStage(assetId, progress);
  return blocker !== null && blocker.assetId !== assetId;
}

export function getInvestmentUnlockStage(assetId: string): InvestmentUnlockDefinition | undefined {
  return INVESTMENT_UNLOCK_STAGES.find((s) => s.assetId === assetId);
}

/**
 * Assets after stage 1 are gated by their learning path (and by the
 * existing prerequisite chain where one is defined). Shared by the asset
 * detail page and Markets so both derive access from the same stage registry.
 */
export const GATED_ASSET_IDS: string[] = INVESTMENT_UNLOCK_STAGES.filter(
  (s) => s.stage > 1
).map((s) => s.assetId);

/**
 * LOCKED    — no stage is defined for this assetId, OR its prerequisite
 *             asset (if any) isn't itself UNLOCKED yet.
 * AVAILABLE — the prerequisite (if any) is satisfied, so this stage's own
 *             lesson is reachable (it always was — see learning/access.ts)
 *             and its investment requirements are startable, but not done.
 * UNLOCKED  — every requirement this stage specifies — lesson, achievement,
 *             and XP floor, whichever are set — is satisfied. The asset is
 *             investable.
 *
 * ALL specified requirements on a stage must hold for UNLOCKED. Evaluated
 * deterministically off the passed-in LearningProgress snapshot with no
 * side effects, so it's cheap to call from any page. This function decides
 * INVESTMENT access ONLY — it must never be used to decide whether lesson
 * content is reachable (see learning/access.ts's getLearningAccess).
 */
export function getInvestmentAccess(
  assetId: string,
  progress: LearningProgress
): InvestmentAccessStatus {
  const stage = getInvestmentUnlockStage(assetId);
  // Every canonical asset is expected to have a stage. Unknown or
  // misconfigured ids must never receive investment access by default.
  if (!stage) return "LOCKED";

  const lessonDone = progress.completedLessons.includes(stage.requiredLessonId);
  const achievementDone = stage.requiredAchievementId
    ? progress.unlockedAchievements.includes(stage.requiredAchievementId)
    : true;
  const xpDone = stage.requiredXP !== undefined ? progress.totalXP >= stage.requiredXP : true;

  if (lessonDone && achievementDone && xpDone) {
    return "UNLOCKED";
  }

  if (!stage.prerequisiteAssetId) return "AVAILABLE";

  const prerequisiteUnlocked =
    getInvestmentAccess(stage.prerequisiteAssetId, progress) === "UNLOCKED";

  return prerequisiteUnlocked ? "AVAILABLE" : "LOCKED";
}

export function isInvestmentUnlocked(assetId: string, progress: LearningProgress): boolean {
  return getInvestmentAccess(assetId, progress) === "UNLOCKED";
}

/** The first stage whose required lesson isn't complete yet — used for the
 * /learn page's "Continue Learning" pointer. Returns null once every
 * defined stage is complete. */
export function getNextInvestmentStage(progress: LearningProgress): InvestmentUnlockDefinition | null {
  return (
    INVESTMENT_UNLOCK_STAGES.find(
      (s) => !progress.completedLessons.includes(s.requiredLessonId)
    ) ?? null
  );
}
