import { beforeEach, describe, expect, it, vi } from "vitest";

// This repository (like the others under src/server) is marked
// server-only — vitest has no bundler condition to resolve that against,
// so it needs a no-op mock here the same way "@/server/db/prisma" does
// below, or the module import itself throws before any test can run.
vi.mock("server-only", () => ({}));

type PrefRow = { userId: string; category: string; enabled: boolean };
type NotificationRow = {
  id: string;
  userId: string;
  type: string;
  sourceId: string;
  assetId: string | null;
  achievementId: string | null;
  tradeSide: string | null;
  readAt: Date | null;
  createdAt: Date;
};
type PushSubRow = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

const prefStore = new Map<string, PrefRow>();
const key = (userId: string, category: string) => `${userId}::${category}`;

const notificationStore = new Map<string, NotificationRow>();
let notificationSeq = 0;

const pushSubStore = new Map<string, PushSubRow>(); // keyed by endpoint
let pushSubSeq = 0;

class UniqueConstraintError extends Error {}

const prismaMock = {
  userNotificationPreference: {
    findMany: vi.fn(async ({ where }: { where: { userId: string; category?: { in: string[] } } }) => {
      return [...prefStore.values()].filter(
        (r) =>
          r.userId === where.userId &&
          (!where.category || where.category.in.includes(r.category))
      );
    }),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { userId_category: { userId: string; category: string } };
        create: PrefRow;
        update: { enabled: boolean };
      }) => {
        const { userId, category } = where.userId_category;
        const k = key(userId, category);
        const existing = prefStore.get(k);
        const row = existing ? { ...existing, ...update } : { ...create };
        prefStore.set(k, row);
        return row;
      }
    ),
  },
  notification: {
    create: vi.fn(async ({ data }: { data: Omit<NotificationRow, "id" | "readAt" | "createdAt"> }) => {
      const dupe = [...notificationStore.values()].some(
        (r) => r.userId === data.userId && r.type === data.type && r.sourceId === data.sourceId
      );
      if (dupe) throw new UniqueConstraintError("Unique constraint failed");
      const row: NotificationRow = {
        ...data,
        id: `notif-${++notificationSeq}`,
        readAt: null,
        createdAt: new Date(),
      };
      notificationStore.set(row.id, row);
      return row;
    }),
    findMany: vi.fn(
      async ({ where, take }: { where: { userId: string }; orderBy?: unknown; take?: number }) => {
        let rows = [...notificationStore.values()].filter((r) => r.userId === where.userId);
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) rows = rows.slice(0, take);
        return rows;
      }
    ),
    count: vi.fn(async ({ where }: { where: { userId: string; readAt: null } }) => {
      return [...notificationStore.values()].filter(
        (r) => r.userId === where.userId && r.readAt === null
      ).length;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id?: string; userId: string; readAt?: null };
        data: { readAt: Date };
      }) => {
        let count = 0;
        for (const row of notificationStore.values()) {
          if (row.userId !== where.userId) continue;
          if (where.id !== undefined && row.id !== where.id) continue;
          if (where.readAt === null && row.readAt !== null) continue;
          row.readAt = data.readAt;
          count++;
        }
        return { count };
      }
    ),
  },
  pushSubscription: {
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { endpoint: string };
        create: Omit<PushSubRow, "id">;
        update: Partial<PushSubRow>;
      }) => {
        const existing = pushSubStore.get(where.endpoint);
        const row: PushSubRow = existing
          ? { ...existing, ...update }
          : { ...create, id: `sub-${++pushSubSeq}` };
        pushSubStore.set(where.endpoint, row);
        return row;
      }
    ),
    deleteMany: vi.fn(async ({ where }: { where: { endpoint: string } }) => {
      const existed = pushSubStore.delete(where.endpoint);
      return { count: existed ? 1 : 0 };
    }),
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
      return [...pushSubStore.values()].filter((r) => r.userId === where.userId);
    }),
  },
};

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    userNotificationPreference: {
      findMany: (...args: unknown[]) =>
        prismaMock.userNotificationPreference.findMany(...(args as [never])),
      upsert: (...args: unknown[]) =>
        prismaMock.userNotificationPreference.upsert(...(args as [never])),
    },
    notification: {
      create: (...args: unknown[]) => prismaMock.notification.create(...(args as [never])),
      findMany: (...args: unknown[]) => prismaMock.notification.findMany(...(args as [never])),
      count: (...args: unknown[]) => prismaMock.notification.count(...(args as [never])),
      updateMany: (...args: unknown[]) => prismaMock.notification.updateMany(...(args as [never])),
    },
    pushSubscription: {
      upsert: (...args: unknown[]) => prismaMock.pushSubscription.upsert(...(args as [never])),
      deleteMany: (...args: unknown[]) => prismaMock.pushSubscription.deleteMany(...(args as [never])),
      findMany: (...args: unknown[]) => prismaMock.pushSubscription.findMany(...(args as [never])),
    },
  },
}));

import {
  getNotificationChannelPreferences,
  setNotificationChannelPreference,
  getNotificationPreferences,
  createNotificationOnce,
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  upsertPushSubscription,
  deletePushSubscription,
  listPushSubscriptionsForUser,
} from "./notifications-repository";

beforeEach(() => {
  prefStore.clear();
  notificationStore.clear();
  pushSubStore.clear();
  notificationSeq = 0;
  pushSubSeq = 0;
  vi.clearAllMocks();
});

describe("notification channel preferences — real state, not a second store", () => {
  it("defaults push to enabled when nothing is persisted yet", async () => {
    expect(await getNotificationChannelPreferences("user-1")).toEqual({ push: true });
  });

  it("persists a channel toggle and reflects it on read", async () => {
    await setNotificationChannelPreference("user-1", "push", false);
    expect(await getNotificationChannelPreferences("user-1")).toEqual({ push: false });
  });

  it("rejects an unknown channel", async () => {
    await expect(setNotificationChannelPreference("user-1", "sms", true)).rejects.toThrow(
      /Invalid notification channel/
    );
  });

  it("rejects email — there is no email delivery implementation, so it is not a valid channel", async () => {
    await expect(setNotificationChannelPreference("user-1", "email", true)).rejects.toThrow(
      /Invalid notification channel/
    );
  });

  it("never leaks channel rows into the content-category preferences", async () => {
    await setNotificationChannelPreference("user-1", "push", false);
    const categoryPrefs = await getNotificationPreferences("user-1");
    // Still exactly the four canonical content categories, all at their
    // real defaults — the channel row must not appear here or corrupt it.
    expect(categoryPrefs).toEqual({
      news: true,
      priceAlerts: true,
      learning: true,
      achievements: true,
    });
  });

  it("keeps channel state isolated per user", async () => {
    await setNotificationChannelPreference("user-1", "push", false);
    expect(await getNotificationChannelPreferences("user-2")).toEqual({ push: true });
  });
});

describe("createNotificationOnce — real events, deduped", () => {
  it("creates a real notification row for a real event", async () => {
    const n = await createNotificationOnce("user-1", "learning_completed", "sp500");
    expect(n).not.toBeNull();
    expect(n?.type).toBe("learning_completed");
    expect(n?.assetId).toBe("sp500");
    expect(n?.read).toBe(false);
  });

  it("never creates a duplicate for the same (userId, type, sourceId) — returns null instead", async () => {
    const first = await createNotificationOnce("user-1", "achievement_earned", "FIRST_LESSON");
    const second = await createNotificationOnce("user-1", "achievement_earned", "FIRST_LESSON");
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await listNotifications("user-1")).toHaveLength(1);
  });

  it("derives achievementId from sourceId for achievement_earned, and assetId for asset-based events", async () => {
    const achievement = await createNotificationOnce("user-1", "achievement_earned", "SEVEN_DAY_STREAK");
    expect(achievement?.achievementId).toBe("SEVEN_DAY_STREAK");
    expect(achievement?.assetId).toBeNull();

    const unlock = await createNotificationOnce("user-1", "investment_unlocked", "nasdaq");
    expect(unlock?.assetId).toBe("nasdaq");
    expect(unlock?.achievementId).toBeNull();
  });

  it("uses the trade's own id as sourceId, letting two trades of the same asset both notify", async () => {
    const trade1 = await createNotificationOnce("user-1", "paper_trade_completed", "trade-1", {
      assetId: "aapl",
      tradeSide: "BUY",
    });
    const trade2 = await createNotificationOnce("user-1", "paper_trade_completed", "trade-2", {
      assetId: "aapl",
      tradeSide: "BUY",
    });
    expect(trade1).not.toBeNull();
    expect(trade2).not.toBeNull();
    expect(await listNotifications("user-1")).toHaveLength(2);
  });

  it("rejects an unknown event type", async () => {
    // @ts-expect-error deliberately invalid at the boundary
    await expect(createNotificationOnce("user-1", "made_up_event", "x")).rejects.toThrow(
      /Invalid notification event type/
    );
  });
});

describe("listNotifications / getUnreadNotificationCount", () => {
  it("returns only the calling user's notifications, most recent first", async () => {
    await createNotificationOnce("user-1", "learning_completed", "sp500");
    await createNotificationOnce("user-1", "learning_completed", "aapl");
    await createNotificationOnce("user-2", "learning_completed", "sp500");

    const list = await listNotifications("user-1");
    expect(list).toHaveLength(2);
    expect(list.every((n) => n.sourceId === "sp500" || n.sourceId === "aapl")).toBe(true);
  });

  it("counts only unread notifications", async () => {
    const n = await createNotificationOnce("user-1", "learning_completed", "sp500");
    await createNotificationOnce("user-1", "learning_completed", "aapl");
    expect(await getUnreadNotificationCount("user-1")).toBe(2);

    await markNotificationRead("user-1", n!.id);
    expect(await getUnreadNotificationCount("user-1")).toBe(1);
  });
});

describe("markNotificationRead — ownership enforced in the query itself", () => {
  it("marks the calling user's own notification read", async () => {
    const n = await createNotificationOnce("user-1", "learning_completed", "sp500");
    await markNotificationRead("user-1", n!.id);
    const [row] = await listNotifications("user-1");
    expect(row.read).toBe(true);
  });

  it("is a silent no-op for a notification belonging to another user", async () => {
    const n = await createNotificationOnce("user-1", "learning_completed", "sp500");
    await markNotificationRead("user-2", n!.id);
    const [row] = await listNotifications("user-1");
    expect(row.read).toBe(false);
  });
});

describe("markAllNotificationsRead", () => {
  it("marks every unread notification for the calling user read, and no one else's", async () => {
    await createNotificationOnce("user-1", "learning_completed", "sp500");
    await createNotificationOnce("user-1", "learning_completed", "aapl");
    await createNotificationOnce("user-2", "learning_completed", "sp500");

    await markAllNotificationsRead("user-1");

    expect(await getUnreadNotificationCount("user-1")).toBe(0);
    expect(await getUnreadNotificationCount("user-2")).toBe(1);
  });
});

describe("push subscriptions — scoped per user", () => {
  it("upserts and lists a subscription for its owner", async () => {
    await upsertPushSubscription("user-1", { endpoint: "https://push/ep1", p256dh: "key1", auth: "auth1" });
    const subs = await listPushSubscriptionsForUser("user-1");
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe("https://push/ep1");
  });

  it("re-upserting the same endpoint updates it in place rather than duplicating", async () => {
    await upsertPushSubscription("user-1", { endpoint: "https://push/ep1", p256dh: "old", auth: "auth1" });
    await upsertPushSubscription("user-1", { endpoint: "https://push/ep1", p256dh: "new", auth: "auth1" });
    const subs = await listPushSubscriptionsForUser("user-1");
    expect(subs).toHaveLength(1);
    expect(subs[0].p256dh).toBe("new");
  });

  it("never lists another user's subscriptions", async () => {
    await upsertPushSubscription("user-1", { endpoint: "https://push/ep1", p256dh: "k", auth: "a" });
    expect(await listPushSubscriptionsForUser("user-2")).toHaveLength(0);
  });

  it("deletes a subscription by endpoint", async () => {
    await upsertPushSubscription("user-1", { endpoint: "https://push/ep1", p256dh: "k", auth: "a" });
    await deletePushSubscription("https://push/ep1");
    expect(await listPushSubscriptionsForUser("user-1")).toHaveLength(0);
  });
});
