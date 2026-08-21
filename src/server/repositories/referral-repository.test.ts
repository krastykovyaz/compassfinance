import { beforeEach, describe, expect, it, vi } from "vitest";

const userStore = new Map<
  string,
  { id: string; referralCode: string | null; referredByUserId: string | null }
>();

const prismaMock = {
  user: {
    findUnique: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
      let user;
      if ("id" in where) user = userStore.get(where.id as string);
      else if ("referralCode" in where) {
        user = [...userStore.values()].find((u) => u.referralCode === where.referralCode);
      }
      if (!user) return null;
      if (select) {
        const projected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) projected[key] = (user as Record<string, unknown>)[key];
        return projected;
      }
      return user;
    }),
    update: vi.fn(async ({ where, data, select }: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const user = userStore.get(where.id);
      if (!user) throw new Error("not found");
      if (data.referralCode) {
        const collision = [...userStore.values()].some(
          (u) => u.id !== where.id && u.referralCode === data.referralCode
        );
        if (collision) throw new Error("Unique constraint failed");
      }
      Object.assign(user, data);
      if (select) {
        const projected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) projected[key] = (user as Record<string, unknown>)[key];
        return projected;
      }
      return user;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const user = userStore.get(where.id as string);
      // The null-guard IS the duplicate-attribution prevention — this only
      // matches (and only updates) when referredByUserId is still null.
      if (!user || user.referredByUserId !== (where.referredByUserId ?? null)) {
        return { count: 0 };
      }
      Object.assign(user, data);
      return { count: 1 };
    }),
    count: vi.fn(async ({ where }: { where: { referredByUserId: string } }) => {
      return [...userStore.values()].filter((u) => u.referredByUserId === where.referredByUserId).length;
    }),
  },
};

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => prismaMock.user.findUnique(...(args as [never])),
      update: (...args: unknown[]) => prismaMock.user.update(...(args as [never])),
      updateMany: (...args: unknown[]) => prismaMock.user.updateMany(...(args as [never])),
      count: (...args: unknown[]) => prismaMock.user.count(...(args as [never])),
    },
  },
}));

import {
  getOrCreateReferralCode,
  getUserIdByReferralCode,
  attributeReferral,
  getReferralCount,
} from "./referral-repository";

beforeEach(() => {
  userStore.clear();
  vi.clearAllMocks();
  userStore.set("user-1", { id: "user-1", referralCode: null, referredByUserId: null });
  userStore.set("user-2", { id: "user-2", referralCode: null, referredByUserId: null });
});

describe("getOrCreateReferralCode", () => {
  it("generates and persists a real code for a user with none yet", async () => {
    const code = await getOrCreateReferralCode("user-1");
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(userStore.get("user-1")?.referralCode).toBe(code);
  });

  it("never regenerates an existing code — the same link stays valid", async () => {
    const first = await getOrCreateReferralCode("user-1");
    const second = await getOrCreateReferralCode("user-1");
    expect(second).toBe(first);
  });

  it("generates a unique code per user", async () => {
    const codeA = await getOrCreateReferralCode("user-1");
    const codeB = await getOrCreateReferralCode("user-2");
    expect(codeA).not.toBe(codeB);
  });
});

describe("getUserIdByReferralCode", () => {
  it("resolves a real code to its owner's user id", async () => {
    const code = await getOrCreateReferralCode("user-1");
    expect(await getUserIdByReferralCode(code)).toBe("user-1");
  });

  it("returns null for a code that doesn't exist — never crashes on an invalid/expired link", async () => {
    expect(await getUserIdByReferralCode("NOTAREAL")).toBeNull();
  });
});

describe("attributeReferral — self-referral and duplicate prevention", () => {
  it("attributes a new user to their real referrer", async () => {
    await attributeReferral("user-2", "user-1");
    expect(userStore.get("user-2")?.referredByUserId).toBe("user-1");
  });

  it("never attributes a self-referral, even if called with the same id twice", async () => {
    await attributeReferral("user-1", "user-1");
    expect(userStore.get("user-1")?.referredByUserId).toBeNull();
  });

  it("prevents duplicate attribution — a second call for an already-attributed user is a no-op", async () => {
    await attributeReferral("user-2", "user-1");
    userStore.set("user-3", { id: "user-3", referralCode: null, referredByUserId: null });
    // Simulate a second, different referrer trying to claim user-2 after
    // the fact — the null-guard means this can never succeed.
    await attributeReferral("user-2", "user-3");
    expect(userStore.get("user-2")?.referredByUserId).toBe("user-1"); // unchanged
  });
});

describe("getReferralCount", () => {
  it("counts real attributed referrals only", async () => {
    await attributeReferral("user-2", "user-1");
    expect(await getReferralCount("user-1")).toBe(1);
    expect(await getReferralCount("user-2")).toBe(0);
  });
});
