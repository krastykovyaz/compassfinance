import "server-only";
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek-provider";
import type { AIErrorKind, AIProvider } from "@/lib/ai/provider";
import type { Locale } from "@/lib/i18n/types";
import type { DifficultyLevel } from "@/lib/ai/difficulty";
import type { CompassContext } from "@/lib/compass/context";
import { classifyMessageIntent, containsRecommendationLanguage, buildSafeRedirect } from "@/lib/compass/policy";
import { validateCompassResult, type CompassBlock } from "@/lib/compass/schemas";
import { buildFinancialContext, detectMentionedAssetId } from "./financial-context-builder";
import { buildCompassSystemPrompt, buildCompassUserPrompt } from "./prompt-builder";
import { getAsset } from "@/lib/assets/catalog";
import {
  createCompassConversation,
  appendCompassMessage,
  getCompassConversation,
  type CompassMessageDTO,
} from "@/server/repositories/compass-conversation-repository";
import { logCompassOperation } from "./log";

// The Compass Agent orchestrator (Phase 4, Section 24). Mirrors
// lib/ai/learning-engine.ts's own shape (provider singleton -> build
// prompt -> call provider -> validate -> log -> return a typed result),
// but with the two extra steps the no-recommendation policy requires
// (Sections 5/6): an INPUT-side check that can skip the LLM call
// entirely for the clearest advice-seeking messages, and an OUTPUT-side
// safety net over whatever DeepSeek actually returns.
//
// This file is also the ONLY place a Compass response is persisted —
// every code path (safe-redirect short-circuit, successful DeepSeek
// call, or a graceful failure) ends by writing exactly one assistant
// message, scoped to the same conversation the user's message was
// appended to, via the user-scoped repository (Section 23/45: cross-user
// isolation is enforced there, not re-implemented here).

let provider: AIProvider | null = null;
function getAIProvider(): AIProvider {
  if (!provider) provider = new DeepSeekProvider();
  return provider;
}

export type CompassChatFailureKind = "invalid_message" | "conversation_not_found" | AIErrorKind | "invalid_response";

export type CompassChatSuccess = {
  ok: true;
  conversationId: string;
  text: string;
  blocks: CompassBlock[];
  suggestedFollowUps: string[];
};

export type CompassChatFailure = {
  ok: false;
  kind: CompassChatFailureKind;
  /** Set whenever a conversation row already exists at the point of
   * failure (including one just created for a first message) — lets the
   * client retry by APPENDING to that same conversation instead of
   * creating a new one on every failed attempt (a live reported bug: a
   * failed first message left an orphaned conversation, and each retry
   * created another). Absent only for failures that never reach
   * conversation creation (invalid_message). */
  conversationId?: string;
};

export type CompassChatResult = CompassChatSuccess | CompassChatFailure;

export type CompassChatParams = {
  userId: string;
  conversationId?: string;
  message: string;
  /** Already re-validated by the caller via parseCompassContext — this
   * function trusts its shape but not its content (Section 24: "validate
   * context"). */
  context: CompassContext;
  locale: Locale;
  learningDifficulty?: DifficultyLevel;
};

const MAX_MESSAGE_LENGTH = 2000;

function isValidMessage(message: string): boolean {
  return typeof message === "string" && message.trim().length > 0 && message.length <= MAX_MESSAGE_LENGTH;
}

/** The generic, always-safe follow-up suggestions used only on the
 * no-LLM-call safe-redirect path (Section 27's own style — analytical,
 * never decision-framed). The full contextual per-screen suggestion
 * lists (shown before the user has typed anything) live in the UI layer,
 * not here. */
function safeRedirectFollowUps(): string[] {
  return ["What are the risks in my portfolio?", "Can you compare a few assets instead?", "What's the recent news on this?"];
}

async function buildStructuredResponse(params: {
  userId: string;
  context: CompassContext;
  message: string;
  locale: Locale;
  learningDifficulty?: DifficultyLevel;
  history: CompassMessageDTO[];
}): Promise<{ ok: true; data: { text: string; blocks: CompassBlock[]; suggestedFollowUps: string[] }; latencyMs: number } | { ok: false; kind: AIErrorKind | "invalid_response"; latencyMs: number }> {
  const financialContext = await buildFinancialContext({
    userId: params.userId,
    context: params.context,
    message: params.message,
    locale: params.locale,
    learningDifficulty: params.learningDifficulty,
  });

  const system = buildCompassSystemPrompt(params.locale);
  const user = buildCompassUserPrompt({ context: params.context, financialContext, history: params.history, message: params.message });

  // maxTokens=1200 — Compass wants a deterministic structured answer, not
  // open-ended deliberation, and a reasoning pass was observed live
  // consuming the ENTIRE previous 700-token budget on its own
  // (reasoning_tokens alone > 700), leaving nothing for the actual JSON
  // and producing an unparseable empty response every time.
  // expectJson: true already defaults DeepSeekProvider to
  // disableReasoning, removing that risk outright and typically finishing
  // in ~1-3s instead of ~15-20s (see deepseek-provider.ts).
  const result = await getAIProvider().complete({ systemPrompt: system, userPrompt: user, expectJson: true, maxTokens: 1200 });
  if (!result.ok) return { ok: false, kind: result.kind, latencyMs: result.latencyMs };

  const validated = validateCompassResult(result.text);
  if (!validated.ok) return { ok: false, kind: "invalid_response", latencyMs: result.latencyMs };

  // Output-side safety net (Section 5/42): if the model's own text (or
  // any block carrying free text) slipped past the system prompt's own
  // instructions and contains recommendation language, discard the
  // entire structured result and substitute the same fixed safe
  // redirect used on the input-side short-circuit — never a partial or
  // "corrected" rewrite of the model's own words.
  const freeText = [validated.data.text, ...validated.data.blocks.flatMap(blockFreeText)].join("\n");
  if (containsRecommendationLanguage(freeText)) {
    const topic = detectMentionedAssetId(params.message);
    return {
      ok: true,
      data: { text: buildSafeRedirect(topic ? (getAsset(topic)?.name ?? null) : null), blocks: [], suggestedFollowUps: safeRedirectFollowUps() },
      latencyMs: result.latencyMs,
    };
  }

  return { ok: true, data: validated.data, latencyMs: result.latencyMs };
}

function blockFreeText(block: CompassBlock): string[] {
  switch (block.type) {
    case "risk":
      return [block.description];
    case "education":
      return [block.body];
    case "scenario":
      return [block.assumption, block.impact];
    case "data_limitation":
      return [block.message];
    default:
      return [];
  }
}

export async function compassChat(params: CompassChatParams): Promise<CompassChatResult> {
  const { userId, message, context, locale } = params;

  if (!isValidMessage(message)) return { ok: false, kind: "invalid_message" };

  let conversationId: string;
  let history: CompassMessageDTO[];

  // The conversation's OWN stored context (its identity/topic) governs
  // what data gets fetched for a follow-up — never the fresh per-request
  // context alone. Without this, a client that keeps the sheet open
  // across navigation (CompassProvider lives in the root layout, so it
  // survives client-side routing) could send a follow-up in an
  // NVDA-scoped thread with a PORTFOLIO context picked up from whatever
  // screen the user is now on, and the engine would silently answer the
  // NVDA conversation with portfolio data. The client still sends its own
  // context on every request (Section 24) — it's used for a NEW
  // conversation's identity and is kept as a fallback if a stored
  // conversation's own context somehow fails to decode.
  let effectiveContext = context;

  if (params.conversationId) {
    const existing = await getCompassConversation(userId, params.conversationId);
    if (!existing) return { ok: false, kind: "conversation_not_found" };
    history = existing.messages;
    conversationId = existing.id;
    effectiveContext = existing.context ?? context;
    await appendCompassMessage({ conversationId, role: "user", content: message, structuredData: null });
  } else {
    const created = await createCompassConversation({ userId, context, firstMessage: { role: "user", content: message, structuredData: null } });
    conversationId = created.id;
    history = [];
  }

  const startedAt = Date.now();

  // Input-side policy short-circuit (Section 38: "avoid unnecessary LLM
  // calls" — the clearest advice-seeking messages never reach DeepSeek at
  // all).
  if (classifyMessageIntent(message) === "advice_seeking") {
    const topic = detectMentionedAssetId(message);
    const text = buildSafeRedirect(topic ? (getAsset(topic)?.name ?? null) : null);
    const blocks: CompassBlock[] = [];
    const suggestedFollowUps = safeRedirectFollowUps();

    await appendCompassMessage({ conversationId, role: "assistant", content: text, structuredData: JSON.stringify({ blocks, suggestedFollowUps }) });
    logCompassOperation({ contextType: effectiveContext.type, locale, latencyMs: Date.now() - startedAt, success: true });
    return { ok: true, conversationId, text, blocks, suggestedFollowUps };
  }

  const result = await buildStructuredResponse({ userId, context: effectiveContext, message, locale, learningDifficulty: params.learningDifficulty, history });

  if (!result.ok) {
    logCompassOperation({ contextType: effectiveContext.type, locale, latencyMs: result.latencyMs, success: false, failureKind: result.kind });
    return { ok: false, kind: result.kind, conversationId };
  }

  await appendCompassMessage({
    conversationId,
    role: "assistant",
    content: result.data.text,
    structuredData: JSON.stringify({ blocks: result.data.blocks, suggestedFollowUps: result.data.suggestedFollowUps }),
  });

  logCompassOperation({ contextType: effectiveContext.type, locale, latencyMs: result.latencyMs, success: true });

  return { ok: true, conversationId, text: result.data.text, blocks: result.data.blocks, suggestedFollowUps: result.data.suggestedFollowUps };
}
