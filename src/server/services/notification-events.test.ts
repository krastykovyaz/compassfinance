import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createNotificationOnce = vi.fn();
const getNotificationChannelPreferences = vi.fn();
const listPushSubscriptionsForUser = vi.fn();
vi.mock("@/server/repositories/notifications-repository", () => ({
  createNotificationOnce: (...args: unknown[]) => createNotificationOnce(...args),
  getNotificationChannelPreferences: (...args: unknown[]) => getNotificationChannelPreferences(...args),
  listPushSubscriptionsForUser: (...args: unknown[]) => listPushSubscriptionsForUser(...args),
}));

const getProfile = vi.fn();
vi.mock("@/server/repositories/profile-repository", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
}));

const sendPushToUser = vi.fn();
vi.mock("./push-sender", () => ({
  sendPushToUser: (...args: unknown[]) => sendPushToUser(...args),
}));

import { notifyUser } from "./notification-events";

const REAL_NOTIFICATION = {
  id: "notif-1",
  type: "learning_completed",
  sourceId: "sp500",
  assetId: "sp500",
  achievementId: null,
  tradeSide: null,
  read: false,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  createNotificationOnce.mockResolvedValue(REAL_NOTIFICATION);
  getNotificationChannelPreferences.mockResolvedValue({ push: true });
  listPushSubscriptionsForUser.mockResolvedValue([]);
  getProfile.mockResolvedValue({ locale: "en", riskProfileId: null, onboardingCompleted: true });
});

describe("notifyUser — persists real events, unconditionally of channel preference", () => {
  it("persists a notification for a real event", async () => {
    await notifyUser("user-1", "learning_completed", "sp500");
    expect(createNotificationOnce).toHaveBeenCalledWith("user-1", "learning_completed", "sp500", undefined);
  });

  it("a duplicate event (repository dedup returns null) is not eligible and never triggers a push", async () => {
    createNotificationOnce.mockResolvedValue(null);
    const result = await notifyUser("user-1", "learning_completed", "sp500");
    expect(result).toEqual({ eligible: false, channels: [] });
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("never throws even when the repository rejects", async () => {
    createNotificationOnce.mockRejectedValue(new Error("db down"));
    await expect(notifyUser("user-1", "learning_completed", "sp500")).resolves.toEqual({
      eligible: false,
      channels: [],
    });
  });
});

describe("notifyUser — push delivery is gated on the push channel + a real subscription", () => {
  it("attempts push when enabled and at least one subscription exists", async () => {
    listPushSubscriptionsForUser.mockResolvedValue([
      { id: "sub-1", userId: "user-1", endpoint: "https://push/ep1", p256dh: "k", auth: "a" },
    ]);
    await notifyUser("user-1", "learning_completed", "sp500");
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser.mock.calls[0][0]).toBe("user-1");
  });

  it("does not attempt push when the push channel is disabled", async () => {
    getNotificationChannelPreferences.mockResolvedValue({ push: false });
    listPushSubscriptionsForUser.mockResolvedValue([
      { id: "sub-1", userId: "user-1", endpoint: "https://push/ep1", p256dh: "k", auth: "a" },
    ]);
    await notifyUser("user-1", "learning_completed", "sp500");
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("does not attempt push when there are no subscriptions, even with push enabled", async () => {
    listPushSubscriptionsForUser.mockResolvedValue([]);
    await notifyUser("user-1", "learning_completed", "sp500");
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("never involves anything email-related — channels can never contain email", async () => {
    getNotificationChannelPreferences.mockResolvedValue({ push: true });
    const result = await notifyUser("user-1", "learning_completed", "sp500");
    expect(result.channels).not.toContain("email");
    expect(result.channels).toEqual(["push"]);
  });
});
