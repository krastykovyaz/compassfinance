import { beforeEach, describe, expect, it, vi } from "vitest";

// This repository (like the others under src/server) is marked
// server-only — vitest has no bundler condition to resolve that against,
// so it needs a no-op mock here the same way "@/server/db/prisma" does
// below, or the module import itself throws before any test can run.
vi.mock("server-only", () => ({}));

type PrefRow = { userId: string; category: string; enabled: boolean };

const prefStore = new Map<string, PrefRow>();
const key = (userId: string, category: string) => `${userId}::${category}`;

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
};

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    userNotificationPreference: {
      findMany: (...args: unknown[]) =>
        prismaMock.userNotificationPreference.findMany(...(args as [never])),
      upsert: (...args: unknown[]) =>
        prismaMock.userNotificationPreference.upsert(...(args as [never])),
    },
  },
}));

import {
  getNotificationChannelPreferences,
  setNotificationChannelPreference,
  getNotificationPreferences,
} from "./notifications-repository";

beforeEach(() => {
  prefStore.clear();
  vi.clearAllMocks();
});

describe("notification channel preferences — real state, not a second store", () => {
  it("defaults both channels to enabled when nothing is persisted yet", async () => {
    expect(await getNotificationChannelPreferences("user-1")).toEqual({
      push: true,
      email: true,
    });
  });

  it("persists a channel toggle and reflects it on read", async () => {
    await setNotificationChannelPreference("user-1", "push", false);
    expect(await getNotificationChannelPreferences("user-1")).toEqual({
      push: false,
      email: true,
    });
  });

  it("rejects an unknown channel", async () => {
    await expect(setNotificationChannelPreference("user-1", "sms", true)).rejects.toThrow(
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
    await setNotificationChannelPreference("user-1", "email", false);
    expect(await getNotificationChannelPreferences("user-2")).toEqual({
      push: true,
      email: true,
    });
  });
});
