// POST /api/ai/tutor
//
// The only LLM entry point used by the learning UI.
// AI is available during lesson study and after a completed quiz.
// It is intentionally not available during the quiz itself.

import { NextResponse } from "next/server";
import { buildLearningContext } from "@/lib/ai/curriculum-context";
import { tutor } from "@/lib/ai/learning-engine";
import { TutorAction, TutorPhase } from "@/lib/ai/prompts";
import { validateBaseFields, isPlainString } from "@/lib/ai/request-validation";
import { checkRateLimit, getClientKey } from "@/lib/ai/rate-limit";

const ACTIONS: TutorAction[] = [
  "explain_simple",
  "real_example",
  "why_it_matters",
  "go_deeper",
  "risks",
  "review_mistakes",
  "advanced_insight",
  "professional_perspective",
  "next_step",
  "user_question",
];

export async function POST(request: Request) {
  if (!checkRateLimit(getClientKey(request.headers))) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const base = validateBaseFields(body);
  if (!base.ok) {
    return NextResponse.json({ ok: false, reason: base.error }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const phase = obj.phase;
  if (phase !== "lesson" && phase !== "post-quiz") {
    return NextResponse.json({ ok: false, reason: "invalid_phase" }, { status: 400 });
  }

  const action = obj.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as TutorAction)) {
    return NextResponse.json({ ok: false, reason: "invalid_action" }, { status: 400 });
  }

  let userQuestion: string | undefined;
  if (obj.userQuestion !== undefined) {
    if (!isPlainString(obj.userQuestion, 1200)) {
      return NextResponse.json({ ok: false, reason: "invalid_userQuestion" }, { status: 400 });
    }
    userQuestion = obj.userQuestion;
  }

  // The result is informational context only. It can never change state.
  if (phase === "post-quiz") {
    if (
      typeof obj.score !== "number" ||
      !Number.isFinite(obj.score) ||
      obj.score < 0 ||
      obj.score > 1 ||
      typeof obj.total !== "number" ||
      !Number.isInteger(obj.total) ||
      obj.total < 1 ||
      obj.total > 100
    ) {
      return NextResponse.json({ ok: false, reason: "invalid_quiz_result" }, { status: 400 });
    }
  }

  const context = buildLearningContext({
    assetId: base.data.assetId,
    lessonId: base.data.lessonId,
    difficulty: base.data.difficulty,
    locale: base.data.locale,
    learnerLevelLabel: base.data.learnerLevelLabel,
    recentMistakeQuestionIds: base.data.recentMistakeQuestionIds,
  });

  if (!context) {
    return NextResponse.json({ ok: false, reason: "unknown_lesson" }, { status: 400 });
  }

  const result = await tutor(context, action as TutorAction, phase as TutorPhase, userQuestion);

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.kind }, { status: 503 });
  }

  return NextResponse.json({ ok: true, data: result.data, cached: result.cached });
}
