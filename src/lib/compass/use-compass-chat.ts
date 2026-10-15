"use client";

import { useCallback, useReducer, useRef } from "react";
import type { CompassContext } from "./context";
import type { Locale } from "@/lib/i18n/types";
import type { CompassBlock } from "./schemas";
import { compassChatReducer, INITIAL_COMPASS_CHAT_STATE } from "./compass-chat-reducer";

type ChatResponseBody = {
  ok: boolean;
  conversationId?: string;
  text?: string;
  blocks?: unknown[];
  suggestedFollowUps?: string[];
  reason?: string;
};

let localIdSeq = 0;
function nextLocalId(prefix: string): string {
  localIdSeq += 1;
  return `${prefix}-${Date.now()}-${localIdSeq}`;
}

/** The one place the UI calls POST /api/compass/chat. Owns conversation
 * continuity (conversationId, once assigned by the server, is sent on
 * every subsequent message so follow-ups stay in the same thread —
 * Section 7: "context must persist during follow-up messages") and
 * surfaces errors as a typed reason string rather than throwing, so the
 * sheet can always render a safe message (Section 39). */
export function useCompassChat(context: CompassContext, locale: Locale) {
  const [state, dispatch] = useReducer(compassChatReducer, INITIAL_COMPASS_CHAT_STATE);

  // Bumped on every RESET — a request started before a reset (e.g. the
  // user closed the sheet while Compass was "thinking") checks this after
  // its fetch resolves and drops the response instead of dispatching it.
  // Without this, a late SEND_SUCCESS/SEND_ERROR landed in the freshly
  // reset (empty) state: an orphan assistant message with no preceding
  // user turn, or an empty chat stuck showing an error — a live reported
  // bug, since CompassProvider (and this hook's state with it) lives in
  // the root layout and survives the sheet closing.
  const generationRef = useRef(0);

  const sendMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      const generation = generationRef.current;
      dispatch({ type: "SEND_START", message: { id: nextLocalId("user"), role: "user", content: trimmed, blocks: [] } });

      try {
        const res = await fetch("/api/compass/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: state.conversationId ?? undefined, message: trimmed, context, locale }),
          signal: AbortSignal.timeout(30_000),
        });
        const body = (await res.json().catch(() => null)) as ChatResponseBody | null;

        if (generationRef.current !== generation) return; // reset while in flight — discard

        if (!res.ok || !body || !body.ok || !body.conversationId || typeof body.text !== "string") {
          dispatch({ type: "SEND_ERROR", reason: body?.reason ?? "network_error", conversationId: body?.conversationId });
          return;
        }

        dispatch({
          type: "SEND_SUCCESS",
          conversationId: body.conversationId,
          message: { id: nextLocalId("assistant"), role: "assistant", content: body.text, blocks: (body.blocks as CompassBlock[]) ?? [] },
          suggestedFollowUps: body.suggestedFollowUps ?? [],
        });
      } catch {
        if (generationRef.current !== generation) return;
        dispatch({ type: "SEND_ERROR", reason: "network_error" });
      }
    },
    // state.conversationId is read at call time deliberately (not just at
    // hook-mount time) so a follow-up always targets the conversation the
    // FIRST message actually created.
    [context, locale, state.conversationId]
  );

  const reset = useCallback(() => {
    generationRef.current += 1;
    dispatch({ type: "RESET" });
  }, []);

  return { ...state, sendMessage, reset };
}
