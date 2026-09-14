import { describe, expect, it } from "vitest";
import { compassChatReducer, INITIAL_COMPASS_CHAT_STATE, type CompassChatState } from "./compass-chat-reducer";

const userMessage = { id: "u1", role: "user" as const, content: "What are the risks in my portfolio?", blocks: [] };
const assistantMessage = { id: "a1", role: "assistant" as const, content: "Here's your risk breakdown.", blocks: [] };

describe("compassChatReducer", () => {
  it("SEND_START appends the user message and moves to sending, clearing any prior error/follow-ups", () => {
    const prior: CompassChatState = { ...INITIAL_COMPASS_CHAT_STATE, status: "error", errorReason: "timeout", suggestedFollowUps: ["stale question"] };
    const next = compassChatReducer(prior, { type: "SEND_START", message: userMessage });
    expect(next.status).toBe("sending");
    expect(next.messages).toEqual([userMessage]);
    expect(next.errorReason).toBeNull();
    expect(next.suggestedFollowUps).toEqual([]);
  });

  it("SEND_SUCCESS appends the assistant message, sets conversationId, and returns to idle", () => {
    const afterStart = compassChatReducer(INITIAL_COMPASS_CHAT_STATE, { type: "SEND_START", message: userMessage });
    const next = compassChatReducer(afterStart, { type: "SEND_SUCCESS", conversationId: "conv-1", message: assistantMessage, suggestedFollowUps: ["Why did it move?"] });
    expect(next.status).toBe("idle");
    expect(next.conversationId).toBe("conv-1");
    expect(next.messages).toEqual([userMessage, assistantMessage]);
    expect(next.suggestedFollowUps).toEqual(["Why did it move?"]);
  });

  it("SEND_ERROR keeps the user's just-sent message rather than discarding it", () => {
    const afterStart = compassChatReducer(INITIAL_COMPASS_CHAT_STATE, { type: "SEND_START", message: userMessage });
    const next = compassChatReducer(afterStart, { type: "SEND_ERROR", reason: "timeout" });
    expect(next.status).toBe("error");
    expect(next.errorReason).toBe("timeout");
    expect(next.messages).toEqual([userMessage]);
  });

  it("a conversation can continue after an error — a later SEND_START/SEND_SUCCESS still appends correctly", () => {
    const afterStart = compassChatReducer(INITIAL_COMPASS_CHAT_STATE, { type: "SEND_START", message: userMessage });
    const afterError = compassChatReducer(afterStart, { type: "SEND_ERROR", reason: "timeout" });
    const retryStart = compassChatReducer(afterError, { type: "SEND_START", message: { ...userMessage, id: "u2" } });
    expect(retryStart.messages).toHaveLength(2);
    expect(retryStart.status).toBe("sending");
  });

  it("RESET returns to the exact initial state", () => {
    const afterStart = compassChatReducer(INITIAL_COMPASS_CHAT_STATE, { type: "SEND_START", message: userMessage });
    const next = compassChatReducer(afterStart, { type: "RESET" });
    expect(next).toEqual(INITIAL_COMPASS_CHAT_STATE);
  });
});
