"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { LessonProgress } from "@/components/lesson/lesson-progress";
import { AssetLessonCard } from "@/components/learning/asset-lesson-card";
import { QuizCard } from "@/components/lesson/quiz-card";
import { QuizResult } from "@/components/lesson/quiz-result";
import { AITutorPanel } from "@/components/learning/ai-tutor-panel";
import { getAssetLearningPath } from "@/lib/learning/content";
import { getLocalizedAssetLearningPath } from "@/lib/learning/content/localization";
import { useProgress } from "@/lib/progress-store";
import { getLessonHref } from "@/lib/learning/routes";
import { XP_REWARDS } from "@/lib/gamification";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { isAssetId } from "@/lib/assets/catalog";
import { toDifficultyLevel } from "@/lib/ai/difficulty";

type Stage = "lesson" | "quiz" | "quiz-result";

export default function AssetLearningPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = use(params);
  const router = useRouter();
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (assetId === "sp500") router.replace("/learn/indices/sp500");
  }, [assetId, router]);

  const path = getAssetLearningPath(assetId);

  if (assetId === "sp500") return null;

  if (!path) {
    return (
      <AppShell>
        <Header title={t("lesson.lesson")} backHref="/learn" />
        <div className="px-5">
          <Card>
            <p className="text-[14px] text-ink-muted">{t("lesson.notAvailableYet")}</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  return <AssetLearningFlow assetId={assetId} locale={locale} />;
}

function AssetLearningFlow({
  assetId,
  locale,
}: {
  assetId: string;
  locale: "en" | "fr" | "ru";
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const path = getLocalizedAssetLearningPath(getAssetLearningPath(assetId)!, locale);

  const {
    getAssetLessonProgress,
    advanceAssetLessonStep,
    completeAssetLesson,
    answerAssetQuizQuestion,
    completeAssetQuiz,
    levelInfo,
    progressError,
    dismissProgressError,
    getBlockingInvestmentStage,
  } = useProgress();

  // Course-level prerequisite gate (Milestone 22): reuses the SAME
  // getBlockingInvestmentStage() the asset entry screen already uses —
  // no second unlock calculation. This only ever fires for the 4
  // gated-ladder assets (nasdaq/aapl/tsla/nvda) when an EARLIER stage in
  // the chain hasn't been finished yet — `blocker.assetId !== assetId`
  // is what distinguishes "a prior course is unfinished" from "this
  // asset's own lesson just isn't done yet" (which is normal, expected,
  // and never gated). sp500 has no prerequisite and the 8 free-standing
  // assets aren't on the ladder at all, so this is null for all of them
  // and the course behaves exactly as before.
  const blocker = getBlockingInvestmentStage(assetId);

  const saved = getAssetLessonProgress(assetId);
  const [stage, setStage] = useState<Stage>(() => {
    if (saved.quizCompleted) return "quiz-result";
    if (saved.lessonCompleted) return "quiz";
    return "lesson";
  });
  const [visibleLessons, setVisibleLessons] = useState(Math.max(1, saved.stepIndex || 1));
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizResults, setQuizResults] = useState<Record<string, boolean>>(saved.quizAnswers);
  const [serverGrade, setServerGrade] = useState<{ score: number; totalQuestions: number } | null>(
    null
  );
  const [pending, setPending] = useState(false);

  const lessonPct = Math.round((visibleLessons / path.lessons.length) * 100);
  const correctCount = serverGrade ? serverGrade.score : Object.values(quizResults).filter(Boolean).length;
  const totalQuizCount = serverGrade ? serverGrade.totalQuestions : path.quizQuestions.length;
  const quizXpEarned = useMemo(
    () => correctCount * XP_REWARDS.quizCorrectAnswer,
    [correctCount]
  );

  // Course-level prerequisite gate — placed AFTER every hook above (React
  // Hooks must run unconditionally on every render), before any of the
  // normal lesson/quiz rendering below.
  if (blocker && blocker.assetId !== assetId) {
    return (
      <AppShell>
        <Header title={path.title} backHref="/learn" />
        <div className="px-5">
          <Card className="text-center">
            <div className="flex justify-center">
              <IconCircle colorKey="slate" size="lg">
                <Lock size={20} />
              </IconCircle>
            </div>
            <p className="mt-2 text-[15px] font-semibold text-ink">{t("learning.learningLocked")}</p>
            <p className="mt-1 text-[13px] font-medium text-ink">
              {t("market.completeFirst")}: {blocker.name}
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">{blocker.unlockDescription}</p>
            <Link
              href={getLessonHref(blocker.assetId)}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-medium text-surface active:opacity-90"
            >
              <BookOpen size={14} />
              {t("learning.startLearning")}: {blocker.name}
            </Link>
            <button
              disabled
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 py-3 text-[14px] font-medium text-ink-faint"
            >
              {t("learning.startLearning")}
            </button>
          </Card>
        </div>
      </AppShell>
    );
  }


  const practiceAsset = isAssetId(assetId) ? assetId : undefined;

  const learnerLevelLabel = `${t("learning.level")} ${levelInfo.level} · ${levelInfo.label}`;
  const recentMistakeQuestionIds = Object.entries(quizResults)
    .filter(([, correct]) => !correct)
    .map(([id]) => id)
    .slice(0, 3);

  const currentQuestion = path.quizQuestions[quizIndex];
  const currentLesson = path.lessons[Math.min(visibleLessons - 1, path.lessons.length - 1)];

  async function handleContinueLesson() {
    if (visibleLessons < path.lessons.length) {
      advanceAssetLessonStep(assetId, path.lessons.length);
      setVisibleLessons((v) => v + 1);
      return;
    }
    setPending(true);
    const success = await completeAssetLesson(assetId);
    setPending(false);
    // Section 9: never fake completion — only advance to the quiz once the
    // server has actually confirmed the lesson is complete.
    if (success) setStage("quiz");
  }

  function handleQuizAnswer(questionId: string, correct: boolean, selectedIndex: number) {
    answerAssetQuizQuestion(assetId, questionId, correct, selectedIndex);
    setQuizResults((r) => ({ ...r, [questionId]: correct }));
  }

  async function handleNextQuestion() {
    if (quizIndex < path.quizQuestions.length - 1) {
      setQuizIndex((i) => i + 1);
      return;
    }
    setPending(true);
    const grade = await completeAssetQuiz(assetId);
    setPending(false);
    // Section 10: the server owns the result — if grading failed, stay on
    // the quiz stage rather than showing results that were never confirmed.
    if (grade) {
      setServerGrade({ score: grade.score, totalQuestions: grade.totalQuestions });
      setStage("quiz-result");
    } else if (!progressError) {
      // Anonymous/local mode: completeAssetQuiz resolves null but always
      // succeeds locally — proceed as before.
      setStage("quiz-result");
    }
  }

  const postQuizLessonId =
    path.quizQuestions.find((q) => !quizResults[q.id])?.lessonId ??
    path.lessons[path.lessons.length - 1]?.id ??
    "";

  const postQuizDifficulty = toDifficultyLevel(
    path.quizQuestions.find((q) => !quizResults[q.id])?.difficulty ?? "medium"
  );

  return (
    <AppShell>
      <Header title={path.title} backHref="/learn" />

      <div className="space-y-4 px-5">
        <LessonProgress
          levelLabel={
            path.category === "index"
              ? t("learning.categoryIndex")
              : path.category === "stock"
                ? t("learning.categoryStock")
                : path.category === "commodity"
                  ? t("learning.categoryCommodity")
                  : t("learning.categoryCrypto")
          }
          xpReward={path.completionReward}
          progressPct={stage === "lesson" ? lessonPct : 100}
          estimatedMinutes={path.lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0)}
        />

        {progressError ? (
          <div className="flex items-center justify-between rounded-2xl bg-negative-bg px-4 py-3 text-[13px] text-negative">
            <span>{progressError}</span>
            <button onClick={dismissProgressError} className="font-medium underline">
              {t("general.dismiss")}
            </button>
          </div>
        ) : null}

        {stage === "lesson" ? (
          <>
            {path.lessons.slice(0, visibleLessons).map((lesson, i) => (
              <AssetLessonCard key={lesson.id} lesson={lesson} index={i} total={path.lessons.length} />
            ))}

            {currentLesson ? (
              <AITutorPanel
                assetId={assetId}
                lessonId={currentLesson.id}
                difficulty={toDifficultyLevel(
                  path.quizQuestions.find((q) => q.lessonId === currentLesson.id)?.difficulty ?? "medium"
                )}
                locale={locale}
                learnerLevelLabel={learnerLevelLabel}
                phase="lesson"
              />
            ) : null}

            <button
              onClick={handleContinueLesson}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-60"
            >
              {t("lesson.continueLesson")} <ArrowRight size={17} />
            </button>
          </>
        ) : null}

        {stage === "quiz" ? (
          <>
            <QuizCard
              key={currentQuestion.id}
              question={{
                id: currentQuestion.id,
                prompt: currentQuestion.question,
                options: currentQuestion.options,
                correctIndex: currentQuestion.correctAnswer,
                explanation: currentQuestion.explanation,
              }}
              index={quizIndex}
              total={path.quizQuestions.length}
              onAnswered={(correct, selectedIndex) =>
                handleQuizAnswer(currentQuestion.id, correct, selectedIndex)
              }
            />

            {quizResults[currentQuestion.id] !== undefined ? (
              <button
                onClick={handleNextQuestion}
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-60"
              >
                {quizIndex < path.quizQuestions.length - 1 ? t("lesson.nextQuestion") : t("lesson.seeResults")}
                <ArrowRight size={17} />
              </button>
            ) : null}
          </>
        ) : null}

        {stage === "quiz-result" ? (
          <>
            <QuizResult
              correctCount={correctCount}
              totalCount={totalQuizCount}
              xpEarned={quizXpEarned}
            />

            <AITutorPanel
              assetId={assetId}
              lessonId={postQuizLessonId}
              difficulty={postQuizDifficulty}
              locale={locale}
              learnerLevelLabel={learnerLevelLabel}
              recentMistakeQuestionIds={recentMistakeQuestionIds}
              phase="post-quiz"
              score={path.quizQuestions.length ? correctCount / path.quizQuestions.length : 0}
              total={path.quizQuestions.length}
            />

            {practiceAsset ? (
              <button
                onClick={() => router.push(`/asset/${assetId}`)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
              >
                <CheckCircle2 size={17} />
                {t("lesson.viewAsset")} {path.title}
              </button>
            ) : (
              <button
                onClick={() => router.push("/learn")}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
              >
                <CheckCircle2 size={17} />
                {t("lesson.backToLearning")}
              </button>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
