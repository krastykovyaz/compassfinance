import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const getCompassConversation = vi.fn();
vi.mock("@/server/repositories/compass-conversation-repository", () => ({
  getCompassConversation: (...args: unknown[]) => getCompassConversation(...args),
}));

import { GET } from "./route";

function request() {
  return new Request("http://localhost/api/compass/conversations/conv-1");
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
});

describe("GET /api/compass/conversations/[id]", () => {
  it("401s a signed-out request without querying the repository", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());
    const res = await GET(request(), { params: Promise.resolve({ id: "conv-1" }) });
    expect(res.status).toBe(401);
    expect(getCompassConversation).not.toHaveBeenCalled();
  });

  it("passes the session userId (never a client-supplied one) to the scoped repository call", async () => {
    getCompassConversation.mockResolvedValue({ id: "conv-1", userId: "user-1", context: { type: "HOME" }, createdAt: "t", updatedAt: "t", messages: [] });
    await GET(request(), { params: Promise.resolve({ id: "conv-1" }) });
    expect(getCompassConversation).toHaveBeenCalledWith("user-1", "conv-1");
  });

  it("404s when the conversation doesn't exist or belongs to another user", async () => {
    getCompassConversation.mockResolvedValue(null);
    const res = await GET(request(), { params: Promise.resolve({ id: "someone-elses-conv" }) });
    expect(res.status).toBe(404);
  });

  it("200s with the conversation for its real owner", async () => {
    const conversation = { id: "conv-1", userId: "user-1", context: { type: "HOME" }, createdAt: "t", updatedAt: "t", messages: [{ id: "m1", conversationId: "conv-1", role: "user", content: "hi", structuredData: null, createdAt: "t" }] };
    getCompassConversation.mockResolvedValue(conversation);
    const res = await GET(request(), { params: Promise.resolve({ id: "conv-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, conversation });
  });
});
