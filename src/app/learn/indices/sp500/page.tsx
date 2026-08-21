"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { LessonProgress } from "@/components/lesson/lesson-progress";
import { AssetLessonCard } from "@/components/learning/asset-lesson-card";
import { QuizCard } from "@/components/lesson/quiz-card";
import { QuizResult } from "@/components/lesson/quiz-result";
import { getAssetLearningPath } from "@/lib/learning/content";
import { getLocalizedAssetLearningPath } from "@/lib/learning/content/localization";
import { useProgress } from "@/lib/progress-store";
import { XP_REWARDS } from "@/lib/gamification";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { AITutorPanel } from "@/components/learning/ai-tutor-panel";
import { toDifficultyLevel } from "@/lib/ai/difficulty";

type Stage = "lesson" | "quiz" | "quiz-result";

export default function Sp500LearningModulePage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { state, advanceLessonStep, completeLesson, answerQuizQuestion, completeQuiz, levelInfo, progressError, dismissProgressError } = useProgress();
  const path = getLocalizedAssetLearningPath(getAssetLearningPath("sp500")!, locale);

  const [stage, setStage] = useState<Stage>(() => {
    if (state.quizCompleted) return "quiz-result";
    if (state.lessonCompleted) return "quiz";
    return "lesson";
  });
  const [visibleSteps, setVisibleSteps] = useState(Math.max(1, state.lessonStepIndex || 1));
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizResults, setQuizResults] = useState<Record<string, boolean>>(state.quizAnswers);
  const [serverGrade, setServerGrade] = useState<{ score: number; totalQuestions: number } | null>(
    null
  );
  const [pending, setPending] = useState(false);

  const lessonPct = Math.round((visibleSteps / path.lessons.length) * 100);
  const correctCount = serverGrade ? serverGrade.score : Object.values(quizResults).filter(Boolean).length;
  const totalQuizCount = serverGrade ? serverGrade.totalQuestions : path.quizQuestions.length;
  const quizXpEarned = useMemo(() => correctCount * XP_REWARDS.quizCorrectAnswer, [correctCount]);

  const learnerLevelLabel = `${t("learning.level")} ${levelInfo.level} · ${levelInfo.label}`;
  const recentMistakeQuestionIds = Object.entries(quizResults)
    .filter(([, correct]) => !correct)
    .map(([id]) => id)
    .slice(0, 3);

  const currentQuestion = path.quizQuestions[quizIndex];
  const currentLesson = path.lessons[Math.min(visibleSteps - 1, path.lessons.length - 1)];

  async function handleContinueLesson() {
    if (visibleSteps < path.lessons.length) {
      advanceLessonStep();
      setVisibleSteps((v) => v + 1);
      return;
    }
    setPending(true);
    const success = await completeLesson();
    setPending(false);
    if (success) setStage("quiz");
  }

  function handleQuizAnswer(questionId: string, correct: boolean, selectedIndex: number) {
    answerQuizQuestion(questionId, correct, selectedIndex);
    setQuizResults((r) => ({ ...r, [questionId]: correct }));
  }

  async function handleNextQuestion() {
    if (quizIndex < path.quizQuestions.length - 1) {
      setQuizIndex((i) => i + 1);
      return;
    }
    setPending(true);
    const grade = await completeQuiz();
    setPending(false);
    if (grade) {
      setServerGrade({ score: grade.score, totalQuestions: grade.totalQuestions });
      setStage("quiz-result");
    } else if (!progressError) {
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
      <Header title={path.title} backHref="/explore" />

      <div className="space-y-4 px-5">
        <LessonProgress
          levelLabel={t("learning.categoryIndex")}
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
            {path.lessons.slice(0, visibleSteps).map((lesson, i) => (
              <AssetLessonCard key={lesson.id} lesson={lesson} index={i} total={path.lessons.length} />
            ))}

            {currentLesson ? (
              <AITutorPanel
                assetId="sp500"
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
              assetId="sp500"
              lessonId={postQuizLessonId}
              difficulty={postQuizDifficulty}
              locale={locale}
              learnerLevelLabel={learnerLevelLabel}
              recentMistakeQuestionIds={recentMistakeQuestionIds}
              phase="post-quiz"
              score={path.quizQuestions.length ? correctCount / path.quizQuestions.length : 0}
              total={path.quizQuestions.length}
            />

            <button
              onClick={() => router.push("/asset/sp500")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
            >
              <CheckCircle2 size={17} /> {t("lesson.practiceAsset")}
            </button>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
