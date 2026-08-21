import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const markNotificationRead = vi.fn();
const getUnreadNotificationCount = vi.fn();
vi.mock("@/server/repositories/notifications-repository", () => ({
  markNotificationRead: (...args: unknown[]) => markNotificationRead(...args),
  getUnreadNotificationCount: (...args: unknown[]) => getUnreadNotificationCount(...args),
}));

import { PATCH } from "./route";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/notifications/[id]", () => {
  it("marks the notification read for the authenticated user and returns the fresh unread count", async () => {
    requireUserId.mockResolvedValue("user-1");
    getUnreadNotificationCount.mockResolvedValue(2);

    const res = await PATCH(new Request("http://localhost/api/notifications/n1", { method: "PATCH" }), params("n1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(markNotificationRead).toHaveBeenCalledWith("user-1", "n1");
    expect(body.unreadCount).toBe(2);
  });

  it("401s a signed-out request", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await PATCH(new Request("http://localhost/api/notifications/n1", { method: "PATCH" }), params("n1"));
    expect(res.status).toBe(401);
    expect(markNotificationRead).not.toHaveBeenCalled();
  });
});
