import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const listNotifications = vi.fn();
const getUnreadNotificationCount = vi.fn();
vi.mock("@/server/repositories/notifications-repository", () => ({
  listNotifications: (...args: unknown[]) => listNotifications(...args),
  getUnreadNotificationCount: (...args: unknown[]) => getUnreadNotificationCount(...args),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/notifications", () => {
  it("returns the authenticated user's notifications and unread count", async () => {
    requireUserId.mockResolvedValue("user-1");
    listNotifications.mockResolvedValue([{ id: "n1", type: "learning_completed" }]);
    getUnreadNotificationCount.mockResolvedValue(1);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.notifications).toHaveLength(1);
    expect(body.unreadCount).toBe(1);
    expect(listNotifications).toHaveBeenCalledWith("user-1");
  });

  it("401s a signed-out request — never leaks another user's notifications by falling back to a default", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET();
    expect(res.status).toBe(401);
    expect(listNotifications).not.toHaveBeenCalled();
  });
});
