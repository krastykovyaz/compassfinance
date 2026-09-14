// POST /api/compass/chat
//
// The single entry point for the Compass Agent (Phase 4, Section 24).
// Authenticates, resolves userId from the session (never trusts a
// client-supplied userId — Section 23's own rule), re-validates the
// client-supplied context (never trusts its shape), rate-limits, then
// delegates everything else — conversation persistence, the
// no-recommendation policy, the Financial Context Builder, the DeepSeek
// call, and structured-output validation — to compassChat().

import { NextResponse } from "next/server";
import { requireUserId, UnauthenticatedError } from "@/server/auth/session";
import { checkRateLimit, getClientKey } from "@/lib/ai/rate-limit";
import { parseCompassContext } from "@/lib/compass/context";
import { isDifficultyLevel } from "@/lib/ai/difficulty";
import { isSupportedLocale } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";
import { compassChat, type CompassChatFailureKind } from "@/server/compass/compass-engine";

const MAX_MESSAGE_LENGTH = 2000;

function isPlainString(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

function statusFor(kind: CompassChatFailureKind): number {
  switch (kind) {
    case "invalid_message":
      return 400;
    case "conversation_not_found":
      return 404;
    case "rate_limited":
      return 429;
    default:
      // missing_api_key / timeout / network_error / invalid_response / provider_error —
      // Compass itself is fine, the upstream model call failed or returned
      // something unusable. Never expose the raw provider error (Section 39).
      return 503;
  }
}

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
    }
    throw err;
  }

  if (!checkRateLimit(`compass:${getClientKey(request.headers)}`)) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }
  const obj = body as Record<string, unknown>;

  if (!isPlainString(obj.message, MAX_MESSAGE_LENGTH)) {
    return NextResponse.json({ ok: false, reason: "invalid_message" }, { status: 400 });
  }

  const context = parseCompassContext(obj.context);
  if (!context) {
    return NextResponse.json({ ok: false, reason: "invalid_context" }, { status: 400 });
  }

  let conversationId: string | undefined;
  if (obj.conversationId !== undefined) {
    if (!isPlainString(obj.conversationId, 100)) {
      return NextResponse.json({ ok: false, reason: "invalid_conversationId" }, { status: 400 });
    }
    conversationId = obj.conversationId;
  }

  const locale: Locale = typeof obj.locale === "string" && isSupportedLocale(obj.locale) ? obj.locale : "en";
  const learningDifficulty = isDifficultyLevel(obj.learningDifficulty) ? obj.learningDifficulty : undefined;

  const result = await compassChat({ userId, conversationId, message: obj.message, context, locale, learningDifficulty });

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.kind }, { status: statusFor(result.kind) });
  }

  return NextResponse.json({
    ok: true,
    conversationId: result.conversationId,
    text: result.text,
    blocks: result.blocks,
    suggestedFollowUps: result.suggestedFollowUps,
  });
}
