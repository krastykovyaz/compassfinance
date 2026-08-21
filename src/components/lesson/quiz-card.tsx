"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { QuizQuestion } from "@/lib/lesson-content";
import { XpAnimation } from "./xp-animation";
import { XP_REWARDS } from "@/lib/gamification";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function QuizCard({
  question,
  index,
  total,
  onAnswered,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  onAnswered: (correct: boolean, selectedIndex: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [xpTrigger, setXpTrigger] = useState(0);
  const { t } = useTranslation();

  const answered = selected !== null;
  const isCorrect = selected === question.correctIndex;

  function handleSelect(i: number) {
    if (answered) return;
    setSelected(i);
    const correct = i === question.correctIndex;
    if (correct) setXpTrigger((t) => t + 1);
    onAnswered(correct, i);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">
          {t("lesson.questionLabel")} {index + 1} {t("general.of")} {total}
        </p>
        {answered ? (
          <XpAnimation amount={isCorrect ? XP_REWARDS.quizCorrectAnswer : 0} trigger={xpTrigger || 1} />
        ) : null}
      </div>

      <h3 className="mt-1.5 text-[15px] font-semibold text-ink">{question.prompt}</h3>

      <div className="mt-3 space-y-2">
        {question.options.map((option, i) => {
          const isSelected = selected === i;
          const showCorrect = answered && i === question.correctIndex;
          const showIncorrect = answered && isSelected && i !== question.correctIndex;

          return (
            <button
              key={option}
              onClick={() => handleSelect(i)}
              disabled={answered}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left text-[14px] font-medium transition-colors",
                showCorrect
                  ? "border-positive bg-positive-bg text-positive"
                  : showIncorrect
                    ? "border-negative bg-negative-bg text-negative"
                    : "border-border bg-surface text-ink hover:bg-surface-2",
                answered && !showCorrect && !showIncorrect ? "opacity-60" : ""
              )}
            >
              <span>{option}</span>
              {showCorrect ? <CheckCircle2 size={18} /> : null}
              {showIncorrect ? <XCircle size={18} /> : null}
            </button>
          );
        })}
      </div>

      {answered ? (
        <div
          className={cn(
            "mt-3 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed",
            isCorrect ? "bg-positive-bg text-positive" : "bg-surface-2 text-ink-muted"
          )}
        >
          <p className="font-medium">{isCorrect ? t("lesson.correct") : t("lesson.notQuite")}</p>
          <p className="mt-0.5">{question.explanation}</p>
        </div>
      ) : null}
    </Card>
  );
}
