"use client";

import { useRef, useState } from "react";
import { DifficultyLevel } from "./difficulty";
import { TutorAction } from "./prompts";
import { TutorResult } from "./schemas";
import { Locale } from "@/lib/i18n/types";

type TutorPhase = "lesson" | "post-quiz";

type TutorParams = {
  assetId: string;
  lessonId: string;
  difficulty: DifficultyLevel;
  locale: Locale;
  learnerLevelLabel?: string;
  recentMistakeQuestionIds?: string[];
  phase: TutorPhase;
  score?: number;
  total?: number;
};

type AIFailureReason = string;

async function postTutor(
  params: TutorParams,
  action: TutorAction,
  userQuestion?: string
): Promise<{ ok: true; data: TutorResult } | { ok: false; reason: AIFailureReason }> {
  try {
    const res = await fetch("/api/ai/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, action, userQuestion }),
    });
    const json = await res.json();
    if (json.ok) return { ok: true, data: json.data as TutorResult };
    return { ok: false, reason: json.reason ?? "provider_error" };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export function useAITutor(params: TutorParams) {
  const [result, setResult] = useState<TutorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AIFailureReason | null>(null);
  const inFlight = useRef(false);

  async function ask(action: TutorAction, userQuestion?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    const response = await postTutor(params, action, userQuestion);
    if (response.ok) setResult(response.data);
    else setError(response.reason);

    setLoading(false);
    inFlight.current = false;
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  return { ask, result, loading, error, reset };
}
