import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

const deletePushSubscription = vi.fn();
vi.mock("@/server/repositories/notifications-repository", () => ({
  deletePushSubscription: (...args: unknown[]) => deletePushSubscription(...args),
}));

const SUBS = [
  { id: "sub-1", userId: "user-1", endpoint: "https://push/ep1", p256dh: "k1", auth: "a1" },
  { id: "sub-2", userId: "user-1", endpoint: "https://push/ep2", p256dh: "k2", auth: "a2" },
];

const PAYLOAD = { title: "Course completed 🎓", body: "S&P 500", href: "/learn/indices/sp500" };

const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  process.env.VAPID_SUBJECT = "mailto:test@compassfinance.online";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("sendPushToUser", () => {
  it("sends to every one of the user's subscriptions", async () => {
    sendNotification.mockResolvedValue(undefined);
    const { sendPushToUser } = await import("./push-sender");
    await sendPushToUser("user-1", PAYLOAD, SUBS);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("removes a subscription the push service reports as gone (410)", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    sendNotification.mockResolvedValueOnce(undefined);
    const { sendPushToUser } = await import("./push-sender");
    await sendPushToUser("user-1", PAYLOAD, SUBS);
    expect(deletePushSubscription).toHaveBeenCalledWith("https://push/ep1");
    expect(deletePushSubscription).toHaveBeenCalledTimes(1);
  });

  it("removes a subscription reported as not found (404)", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("not found"), { statusCode: 404 }));
    sendNotification.mockResolvedValueOnce(undefined);
    const { sendPushToUser } = await import("./push-sender");
    await sendPushToUser("user-1", PAYLOAD, [SUBS[0]]);
    expect(deletePushSubscription).toHaveBeenCalledWith("https://push/ep1");
  });

  it("does not remove a subscription on a transient failure (e.g. 500)", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("server error"), { statusCode: 500 }));
    const { sendPushToUser } = await import("./push-sender");
    await sendPushToUser("user-1", PAYLOAD, [SUBS[0]]);
    expect(deletePushSubscription).not.toHaveBeenCalled();
  });

  it("never throws, even when every send fails", async () => {
    sendNotification.mockRejectedValue(new Error("boom"));
    const { sendPushToUser } = await import("./push-sender");
    await expect(sendPushToUser("user-1", PAYLOAD, SUBS)).resolves.toBeUndefined();
  });

  it("skips sending without throwing when VAPID isn't configured — never pretends delivery succeeded", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { sendPushToUser } = await import("./push-sender");
    await sendPushToUser("user-1", PAYLOAD, SUBS);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
