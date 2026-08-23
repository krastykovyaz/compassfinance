"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { getLevelInfo } from "@/lib/gamification";
import { deriveCompletedQuizzes, deriveLearningProgress } from "@/lib/learning/progress";
import {
  getInvestmentAccess as getInvestmentAccessForStage,
  getBlockingInvestmentStage,
  isInvestmentUnlocked as isInvestmentUnlockedByStage,
} from "@/lib/learning/unlocks";
import { getAssetLearningAccess } from "@/lib/learning/access";
import { AchievementDefinition, InvestmentAccessStatus, InvestmentUnlockDefinition, LearningProgress } from "@/lib/learning/types";
import { getAchievement } from "@/lib/learning/achievements";
import { LearningAccessStatus } from "@/lib/learning/access";
import { RiskProfileId } from "@/lib/risk-profile/risk-profiles";
import { InterestCategoryId } from "@/lib/interests/interests";
import {
  AssetLessonProgress,
  ProgressState,
  STORAGE_KEY,
  defaultState,
} from "@/lib/learning/state";
import {
  advanceAssetLessonStepReducer,
  advanceLessonStepReducer,
  answerAssetQuizQuestionReducer,
  answerQuizQuestionReducer,
  applyMutation,
  completeAssetLessonReducer,
  completeAssetQuizReducer,
  completeLessonReducer,
  completeQuizReducer,
  getAssetProgress,
  recordAssetViewReducer,
} from "@/lib/learning/reducer";
import { buildProgressStateFromServer, MeResponse } from "@/lib/server-sync/build-progress-state";

// Re-exported so existing call sites that only need the state/type shapes
// don't need to know they moved to learning/state.ts in Milestone 8.
export type { ProgressState, AssetLessonProgress } from "@/lib/learning/state";

type QuizGrade = { score: number; totalQuestions: number; passed: boolean };

type ProgressContextValue = {
  state: ProgressState;
  levelInfo: ReturnType<typeof getLevelInfo>;
  advanceLessonStep: () => void;
  completeLesson: () => Promise<boolean>;
  answerQuizQuestion: (questionId: string, correct: boolean, selectedOptionId?: number) => void;
  completeQuiz: () => Promise<QuizGrade | null>;
  isInvestmentUnlocked: (assetId: string) => boolean;
  resetProgress: () => void;
  setRiskProfile: (id: RiskProfileId) => void;
  toggleInterest: (id: InterestCategoryId) => void;

  learningProgress: LearningProgress;
  getInvestmentAccess: (assetId: string) => InvestmentAccessStatus;
  /** The one stage actually blocking this asset's investment access right now — see unlocks.ts's getBlockingInvestmentStage. Null when unlocked or ungated. */
  getBlockingInvestmentStage: (assetId: string) => InvestmentUnlockDefinition | null;
  getLearningAccess: (assetId: string) => LearningAccessStatus;
  recordAssetView: (slug: string) => void;
  pendingAchievementToast: AchievementDefinition | null;
  dismissAchievementToast: () => void;

  getAssetLessonProgress: (assetId: string) => AssetLessonProgress;
  advanceAssetLessonStep: (assetId: string, totalSteps: number) => void;
  completeAssetLesson: (assetId: string) => Promise<boolean>;
  answerAssetQuizQuestion: (
    assetId: string,
    questionId: string,
    correct: boolean,
    selectedOptionId?: number
  ) => void;
  completeAssetQuiz: (assetId: string) => Promise<QuizGrade | null>;

  /** Milestone 11.1: whether the current session is authenticated — the
   * database becomes authoritative in that case (Section 1/3). */
  isAuthenticated: boolean;
  /** True while the initial /api/me hydration is in flight. */
  isLoadingServerState: boolean;
  /** Set when a user-owned mutation fails server-side. Errors are never
   * swallowed (Section 21) — the UI is expected to surface this. */
  progressError: string | null;
  dismissProgressError: () => void;
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `Request to ${url} failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new Error(message);
  }
  return res.json();
}

/**
 * The React provider. Milestone 11.1's core rule (Section 1): for an
 * authenticated user, the database is the ONLY authoritative store for
 * user-owned state — locale, risk profile, interests, onboarding,
 * learning progress, quiz results, XP, achievements, asset unlocks,
 * favorites, notification preferences. localStorage is never read to
 * seed that state for an authenticated user, and never overrides a
 * database value.
 *
 * Anonymous visitors keep the original localStorage-backed
 * reducer/mutate() pipeline unchanged (Section 4) — that's the "local
 * demo" experience, and it has nothing to do with any account.
 *
 * Both hooks below are called unconditionally (rules of hooks); which
 * one's result actually drives the exposed context value is decided by
 * `sessionStatus`.
 */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus, data: session } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";

  const anonymous = useAnonymousProgress();
  const authed = useAuthenticatedProgress(isAuthenticated, session?.user?.id ?? null);

  const active = isAuthenticated ? authed : anonymous;

  const value: ProgressContextValue = { ...active };

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within a ProgressProvider");
  return ctx;
}

// =============================================================================
// Anonymous path — unchanged from Milestone 8/9/10 behavior, localStorage-backed.
// =============================================================================

type BaseValue = ProgressContextValue;

function useAnonymousProgress(): BaseValue {
  const [state, setState] = useState<ProgressState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [pendingAchievementToast, setPendingAchievementToast] =
    useState<AchievementDefinition | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ProgressState;
          setState({ ...defaultState, ...parsed });
        }
      } catch {
        // ignore corrupt storage
      }
      setHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota/storage errors — this is a demo, not critical data
    }
  }, [state, hydrated]);

  const levelInfo = useMemo(() => getLevelInfo(state.xp), [state.xp]);

  const learningProgress = useMemo(
    () =>
      deriveLearningProgress({
        xp: state.xp,
        completedLessons: state.completedLessons,
        completedQuizzes: deriveCompletedQuizzes(state),
        quizzesCompletedCount: state.quizzesCompletedCount,
        correctAnswersCount: state.correctAnswersCount,
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        assetsExploredSlugs: state.assetsExploredSlugs,
        // Paper trading is now server-backed and authenticated-only (see
        // src/lib/trading/) — the anonymous/local progress path has no
        // trades to report, same as it has no cash balance or positions.
        investmentsMade: 0,
        distinctAssetsInvested: 0,
        achievements: state.achievements,
        lastActivityAt: state.lastActivityAt,
      }),
    [state]
  );

  function mutate(updater: (s: ProgressState) => ProgressState) {
    setState((s) => {
      const { state: next, unlocked } = applyMutation(s, updater);
      if (unlocked) {
        setTimeout(() => setPendingAchievementToast(unlocked), 0);
      }
      return next;
    });
  }

  const advanceLessonStep = () => mutate(advanceLessonStepReducer);
  const completeLesson = async () => {
    mutate(completeLessonReducer);
    return true;
  };
  const answerQuizQuestion = (questionId: string, correct: boolean) =>
    mutate((s) => answerQuizQuestionReducer(s, questionId, correct));
  const completeQuiz = async () => {
    mutate(completeQuizReducer);
    return null;
  };

  const getAssetLessonProgress = (assetId: string) => getAssetProgress(state, assetId);

  const advanceAssetLessonStep = (assetId: string, totalSteps: number) =>
    mutate((s) => advanceAssetLessonStepReducer(s, assetId, totalSteps));

  const completeAssetLesson = async (assetId: string) => {
    mutate((s) => completeAssetLessonReducer(s, assetId));
    return true;
  };

  const answerAssetQuizQuestion = (assetId: string, questionId: string, correct: boolean) =>
    mutate((s) => answerAssetQuizQuestionReducer(s, assetId, questionId, correct));

  const completeAssetQuiz = async (assetId: string) => {
    mutate((s) => completeAssetQuizReducer(s, assetId));
    return null;
  };

  const setRiskProfile = (id: RiskProfileId) =>
    setState((s) => (s.riskProfileId === id ? s : { ...s, riskProfileId: id }));

  const toggleInterest = (id: InterestCategoryId) =>
    setState((s) => ({
      ...s,
      interests: s.interests.includes(id)
        ? s.interests.filter((existing) => existing !== id)
        : [...s.interests, id],
    }));

  const recordAssetView = (slug: string) => mutate((s) => recordAssetViewReducer(s, slug));

  const resetProgress = () => {
    setState(defaultState);
    setPendingAchievementToast(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return {
    state,
    levelInfo,
    advanceLessonStep,
    completeLesson,
    answerQuizQuestion,
    completeQuiz,
    isInvestmentUnlocked: (assetId: string) => isInvestmentUnlockedByStage(assetId, learningProgress),
    resetProgress,
    setRiskProfile,
    toggleInterest,
    learningProgress,
    getInvestmentAccess: (assetId: string) => getInvestmentAccessForStage(assetId, learningProgress),
    getBlockingInvestmentStage: (assetId: string) => getBlockingInvestmentStage(assetId, learningProgress),
    getLearningAccess: (assetId: string) => getAssetLearningAccess(state, assetId),
    recordAssetView,
    pendingAchievementToast,
    dismissAchievementToast: () => setPendingAchievementToast(null),
    getAssetLessonProgress,
    advanceAssetLessonStep,
    completeAssetLesson,
    answerAssetQuizQuestion,
    completeAssetQuiz,
    isAuthenticated: false,
    isLoadingServerState: false,
    progressError: null,
    dismissProgressError: () => {},
  };
}

// =============================================================================
// Authenticated path (Milestone 11.1) — database is authoritative.
// =============================================================================

function useAuthenticatedProgress(
  isAuthenticated: boolean,
  userId: string | null
): ProgressContextValue {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAchievementToast, setPendingAchievementToast] =
    useState<AchievementDefinition | null>(null);
  const pendingAnswers = useRef<Record<string, Record<string, number>>>({});
  const pendingCorrectness = useRef<Record<string, Record<string, boolean>>>({});
  const attemptIds = useRef<Record<string, string>>({});

  // Section 22: clear everything the instant the authenticated identity
  // changes (including logging out), so user B can never render a frame
  // of user A's state — refetch happens in the next effect.
  useEffect(() => {
    const timer = setTimeout(() => {
      setMe(null);
      setLoading(isAuthenticated);
      pendingAnswers.current = {};
      pendingCorrectness.current = {};
      attemptIds.current = {};
    }, 0);
    return () => clearTimeout(timer);
  }, [userId, isAuthenticated]);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await fetchJson<MeResponse>("/api/me");
      setMe(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your data");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refetch();
    }, 0);
    return () => clearTimeout(timer);
  }, [refetch, userId]);

  const state = useMemo(
    () =>
      me
        ? buildProgressStateFromServer(me, {
            sp500: pendingCorrectness.current["sp500"] ?? {},
          })
        : defaultState,
    [me]
  );

  const levelInfo = useMemo(() => getLevelInfo(state.xp), [state.xp]);

  const learningProgress: LearningProgress = me?.progress ?? {
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
    completedQuizzes: [],
    lastActivityAt: null,
  };

  function applyServerProgress(next: LearningProgress) {
    setMe((prev) => {
      if (!prev) return prev;
      const newlyUnlocked = next.unlockedAchievements.filter(
        (id) => !prev.progress.unlockedAchievements.includes(id)
      );
      if (newlyUnlocked.length > 0) {
        const def = getAchievement(newlyUnlocked[0]);
        if (def) setTimeout(() => setPendingAchievementToast(def), 0);
      }
      return { ...prev, progress: next };
    });
  }

  async function completeLesson(): Promise<boolean> {
    return completeAssetLesson("sp500");
  }

  async function completeAssetLesson(assetId: string): Promise<boolean> {
    try {
      const { progress } = await fetchJson<{ progress: LearningProgress }>(
        `/api/user/lessons/${assetId}/complete`,
        { method: "POST" }
      );
      setMe((prev) =>
        prev
          ? {
              ...prev,
              assetProgress: {
                ...prev.assetProgress,
                [assetId]: {
                  stepIndex: prev.assetProgress[assetId]?.stepIndex ?? 0,
                  lessonCompleted: true,
                  quizCompleted: prev.assetProgress[assetId]?.quizCompleted ?? false,
                },
              },
            }
          : prev
      );
      applyServerProgress(progress);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your lesson progress");
      return false;
    }
  }

  function answerAssetQuizQuestion(
    assetId: string,
    questionId: string,
    correct: boolean,
    selectedOptionId?: number
  ) {
    pendingCorrectness.current[assetId] = {
      ...(pendingCorrectness.current[assetId] ?? {}),
      [questionId]: correct,
    };
    if (typeof selectedOptionId === "number") {
      pendingAnswers.current[assetId] = {
        ...(pendingAnswers.current[assetId] ?? {}),
        [questionId]: selectedOptionId,
      };
    }
    // Force a render so getAssetLessonProgress()'s quizAnswers reflects the
    // tap immediately (instant per-question color feedback stays local —
    // Section 10 — the server only ever sees the final submission).
    setMe((prev) => (prev ? { ...prev } : prev));
  }

  function answerQuizQuestion(questionId: string, correct: boolean, selectedOptionId?: number) {
    answerAssetQuizQuestion("sp500", questionId, correct, selectedOptionId);
  }

  async function completeAssetQuiz(assetId: string): Promise<QuizGrade | null> {
    const answersMap = pendingAnswers.current[assetId] ?? {};
    const answers = Object.entries(answersMap).map(([questionId, selectedOptionId]) => ({
      questionId,
      selectedOptionId,
    }));
    if (!attemptIds.current[assetId]) {
      attemptIds.current[assetId] =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `attempt-${Date.now()}-${Math.random()}`;
    }
    try {
      const { grade, progress } = await fetchJson<{
        grade: QuizGrade;
        progress: LearningProgress;
        alreadySubmitted: boolean;
      }>(`/api/user/quiz/${assetId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attemptIds.current[assetId], answers }),
      });
      setMe((prev) =>
        prev
          ? {
              ...prev,
              assetProgress: {
                ...prev.assetProgress,
                [assetId]: {
                  stepIndex: prev.assetProgress[assetId]?.stepIndex ?? 0,
                  lessonCompleted: prev.assetProgress[assetId]?.lessonCompleted ?? true,
                  quizCompleted: true,
                },
              },
            }
          : prev
      );
      applyServerProgress(progress);
      setError(null);
      return grade;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit your quiz");
      return null;
    }
  }

  async function completeQuiz(): Promise<QuizGrade | null> {
    return completeAssetQuiz("sp500");
  }

  function advanceAssetLessonStep(assetId: string, totalSteps: number) {
    const current = me?.assetProgress[assetId]?.stepIndex ?? 0;
    const next = Math.min(totalSteps - 1, current + 1);
    setMe((prev) =>
      prev
        ? {
            ...prev,
            assetProgress: {
              ...prev.assetProgress,
              [assetId]: {
                stepIndex: next,
                lessonCompleted: prev.assetProgress[assetId]?.lessonCompleted ?? false,
                quizCompleted: prev.assetProgress[assetId]?.quizCompleted ?? false,
              },
            },
          }
        : prev
    );
    // Best-effort checkpoint — losing exact scroll position on failure
    // isn't a correctness-critical event, unlike completion/grading above.
    fetch(`/api/user/lessons/${assetId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIndex: next }),
    }).catch(() => {
      // will simply re-sync from the server on next hydration
    });
  }

  function advanceLessonStep() {
    advanceAssetLessonStep("sp500", 6);
  }

  function setRiskProfile(id: RiskProfileId) {
    const previous = me?.user.riskProfileId ?? null;
    setMe((prev) => (prev ? { ...prev, user: { ...prev.user, riskProfileId: id } } : prev));
    fetchJson("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskProfileId: id }),
    }).catch((err) => {
      // Roll back — Section 6: "do NOT permanently show a new risk
      // profile if the database update failed."
      setMe((prev) => (prev ? { ...prev, user: { ...prev.user, riskProfileId: previous } } : prev));
      setError(err instanceof Error ? err.message : "Couldn't save your risk profile");
    });
  }

  function toggleInterest(id: InterestCategoryId) {
    const wasSelected = me?.interests.includes(id) ?? false;
    setMe((prev) =>
      prev
        ? {
            ...prev,
            interests: wasSelected
              ? prev.interests.filter((existing) => existing !== id)
              : [...prev.interests, id],
          }
        : prev
    );
    const request = wasSelected
      ? fetchJson(`/api/user/interests/${id}`, { method: "DELETE" })
      : fetchJson("/api/user/interests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: id }),
        });
    request.catch((err) => {
      // Roll back — Section 7: don't silently pretend persistence
      // succeeded.
      setMe((prev) =>
        prev
          ? {
              ...prev,
              interests: wasSelected ? [...prev.interests, id] : prev.interests.filter((x) => x !== id),
            }
          : prev
      );
      setError(err instanceof Error ? err.message : "Couldn't save your interests");
    });
  }

  function recordAssetView(slug: string) {
    fetch("/api/user/asset-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: slug }),
    }).catch(() => {
      // supplementary stat only — not one of this milestone's
      // correctness-critical events, so a soft failure is acceptable
    });
  }

  function resetProgress() {
    // Authenticated reset isn't destructive server-side from the client
    // (no "delete my account data" flow this milestone) — this just
    // re-syncs from the database, which is already authoritative.
    refetch();
  }

  const getAssetLessonProgress = (assetId: string) => getAssetProgress(state, assetId);

  return {
    state,
    levelInfo,
    advanceLessonStep,
    completeLesson,
    answerQuizQuestion,
    completeQuiz,
    isInvestmentUnlocked: (assetId: string) => isInvestmentUnlockedByStage(assetId, learningProgress),
    resetProgress,
    setRiskProfile,
    toggleInterest,
    learningProgress,
    getInvestmentAccess: (assetId: string) => getInvestmentAccessForStage(assetId, learningProgress),
    getBlockingInvestmentStage: (assetId: string) => getBlockingInvestmentStage(assetId, learningProgress),
    getLearningAccess: (assetId: string) => getAssetLearningAccess(state, assetId),
    recordAssetView,
    pendingAchievementToast,
    dismissAchievementToast: () => setPendingAchievementToast(null),
    getAssetLessonProgress,
    advanceAssetLessonStep,
    completeAssetLesson,
    answerAssetQuizQuestion,
    completeAssetQuiz,
    isAuthenticated: true,
    isLoadingServerState: loading,
    progressError: error,
    dismissProgressError: () => setError(null),
  };
}
