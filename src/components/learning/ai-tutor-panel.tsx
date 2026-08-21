"use client";

import { useState } from "react";
import { RefreshCw, Send, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAITutor } from "@/lib/ai/use-ai-tutor";
import { DifficultyLevel } from "@/lib/ai/difficulty";
import { TutorAction } from "@/lib/ai/prompts";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

type Phase = "lesson" | "post-quiz";

const LESSON_ACTIONS: TutorAction[] = [
  "explain_simple",
  "real_example",
  "why_it_matters",
  "go_deeper",
  "risks",
];

export function AITutorPanel({
  assetId,
  lessonId,
  difficulty,
  locale,
  learnerLevelLabel,
  recentMistakeQuestionIds,
  phase,
  score,
  total,
}: {
  assetId: string;
  lessonId: string;
  difficulty: DifficultyLevel;
  locale: Locale;
  learnerLevelLabel?: string;
  recentMistakeQuestionIds?: string[];
  phase: Phase;
  score?: number;
  total?: number;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");

  const params = {
    assetId,
    lessonId,
    difficulty,
    locale,
    learnerLevelLabel,
    recentMistakeQuestionIds,
    phase,
    score,
    total,
  };

  const { ask, result, loading, error, reset } = useAITutor(params);

  const perfect = phase === "post-quiz" && score === 1;
  const medium = phase === "post-quiz" && score !== undefined && score >= 0.7 && score < 1;

  const actions: TutorAction[] =
    phase === "lesson"
      ? LESSON_ACTIONS
      : perfect
        ? ["go_deeper", "advanced_insight", "professional_perspective", "next_step"]
        : medium
          ? ["review_mistakes", "go_deeper", "real_example"]
          : ["review_mistakes", "explain_simple", "real_example"];

  const actionLabels: Record<TutorAction, string> = {
    explain_simple: t("ai.explainSimple"),
    real_example: t("ai.realExample"),
    why_it_matters: t("ai.whyItMattersAction"),
    go_deeper: t("ai.goDeeper"),
    risks: t("ai.mainRisks"),
    review_mistakes: t("ai.reviewMistakes"),
    advanced_insight: t("ai.advancedInsight"),
    professional_perspective: t("ai.professionalPerspective"),
    next_step: t("ai.nextStep"),
    user_question: t("ai.askCompass"),
  };

  async function handleAsk() {
    const value = question.trim();
    if (!value || loading) return;
    setQuestion("");
    await ask("user_question", value);
  }

  return (
    <Card className="border-purple/20 bg-purple-50/40">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-purple">
        <Sparkles size={12} />
        {t("ai.tutorTitle")}
      </div>

      {phase === "post-quiz" ? (
        <p className="mt-1 text-[13px] text-ink-muted">
          {perfect
            ? t("ai.perfectResultIntro")
            : medium
              ? t("ai.mediumResultIntro")
              : t("ai.lowResultIntro")}
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-ink-muted">{t("ai.tutorSubtitle")}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={loading}
            onClick={() => ask(action)}
            className={cn(
              "rounded-full border border-purple/20 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink",
              loading && "opacity-50"
            )}
          >
            {actionLabels[action]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAsk();
          }}
          disabled={loading}
          placeholder={t("ai.askPlaceholder")}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] text-ink outline-none focus:border-purple"
          aria-label={t("ai.askCompass")}
        />
        <button
          type="button"
          disabled={loading || question.trim().length === 0}
          onClick={() => void handleAsk()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-surface disabled:opacity-40"
          aria-label={t("ai.askCompass")}
        >
          <Send size={15} />
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-[13px] text-ink-muted">{t("ai.thinking")}</p>
      ) : error ? (
        <div className="mt-3">
          <p className="text-[13px] text-ink-muted">{t("ai.tutorUnavailable")}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-blue"
          >
            <RefreshCw size={13} />
            {t("ai.tryAgain")}
          </button>
        </div>
      ) : result ? (
        <div className="mt-4 space-y-2 rounded-xl bg-surface p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-ink">{result.title}</h3>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-ink-faint underline"
            >
              {t("general.close")}
            </button>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-muted">{result.explanation}</p>

          {result.keyPoints.length > 0 ? (
            <ul className="space-y-1 text-[13px] text-ink-muted">
              {result.keyPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-purple" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {result.example ? (
            <div>
              <p className="text-[11px] font-semibold text-ink-faint">{t("ai.example")}</p>
              <p className="text-[13px] leading-relaxed text-ink-muted">{result.example}</p>
            </div>
          ) : null}

          {result.nextStep ? (
            <div>
              <p className="text-[11px] font-semibold text-ink-faint">{t("ai.nextStep")}</p>
              <p className="text-[13px] leading-relaxed text-ink-muted">{result.nextStep}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
