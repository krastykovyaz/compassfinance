import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const markAllNotificationsRead = vi.fn();
vi.mock("@/server/repositories/notifications-repository", () => ({
  markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsRead(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/notifications/read-all", () => {
  it("marks all of the authenticated user's notifications read", async () => {
    requireUserId.mockResolvedValue("user-1");

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(markAllNotificationsRead).toHaveBeenCalledWith("user-1");
    expect(body.unreadCount).toBe(0);
  });

  it("401s a signed-out request", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await POST();
    expect(res.status).toBe(401);
    expect(markAllNotificationsRead).not.toHaveBeenCalled();
  });
});
