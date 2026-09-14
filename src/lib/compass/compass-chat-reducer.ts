import type { CompassBlock } from "./schemas";

// Pure state machine for the Compass chat UI (extracted from
// use-compass-chat.ts so the transition logic is unit-testable without
// mounting a React component — this codebase has no React Testing
// Library, so any component-level logic worth testing lives in a plain
// function like this one).

export type CompassChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: CompassBlock[];
};

export type CompassChatState = {
  status: "idle" | "sending" | "error";
  conversationId: string | null;
  messages: CompassChatMessage[];
  suggestedFollowUps: string[];
  errorReason: string | null;
};

export type CompassChatAction =
  | { type: "SEND_START"; message: CompassChatMessage }
  | { type: "SEND_SUCCESS"; conversationId: string; message: CompassChatMessage; suggestedFollowUps: string[] }
  | { type: "SEND_ERROR"; reason: string }
  | { type: "RESET" };

export const INITIAL_COMPASS_CHAT_STATE: CompassChatState = {
  status: "idle",
  conversationId: null,
  messages: [],
  suggestedFollowUps: [],
  errorReason: null,
};

export function compassChatReducer(state: CompassChatState, action: CompassChatAction): CompassChatState {
  switch (action.type) {
    case "SEND_START":
      return { ...state, status: "sending", messages: [...state.messages, action.message], errorReason: null, suggestedFollowUps: [] };
    case "SEND_SUCCESS":
      return {
        ...state,
        status: "idle",
        conversationId: action.conversationId,
        messages: [...state.messages, action.message],
        suggestedFollowUps: action.suggestedFollowUps,
        errorReason: null,
      };
    case "SEND_ERROR":
      // Deliberately keeps the just-added user message in place (it was
      // really sent) rather than rolling it back — the UI shows an error
      // state alongside it so the user can see what failed and retry,
      // rather than losing their own typed text.
      return { ...state, status: "error", errorReason: action.reason };
    case "RESET":
      return INITIAL_COMPASS_CHAT_STATE;
  }
}
