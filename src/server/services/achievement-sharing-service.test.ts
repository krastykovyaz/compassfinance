import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerLearningProgress = vi.fn();
vi.mock("@/server/repositories/learning-repository", () => ({
  getServerLearningProgress: (...args: unknown[]) => getServerLearningProgress(...(args as [never])),
}));

const prismaMock = {
  achievementShare: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
};
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    achievementShare: {
      create: (...args: unknown[]) => prismaMock.achievementShare.create(...(args as [never])),
      findUnique: (...args: unknown[]) => prismaMock.achievementShare.findUnique(...(args as [never])),
    },
  },
}));

import {
  shareAssetUnlock,
  shareAchievement,
  getPublicShare,
  ShareError,
} from "./achievement-sharing-service";

function progress(overrides: Record<string, unknown> = {}) {
  return {
    totalXP: 0,
    level: 1,
    lessonsCompleted: 0,
    quizzesCompleted: 0,
    correctAnswers: 0,
    currentStreak: 0,
    longestStreak: 0,
    assetsExplored: 0,
    investmentsMade: 0,
    distinctAssetsInvested: 0,
    unlockedAchievements: [],
    completedLessons: [],
    lastActivityAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.achievementShare.create.mockResolvedValue({});
});

describe("shareAssetUnlock — never shares a fake/unearned unlock", () => {
  it("refuses to mint a share token for an asset that isn't actually unlocked", async () => {
    getServerLearningProgress.mockResolvedValue(progress()); // nothing done — nasdaq is locked
    await expect(shareAssetUnlock("user-1", "nasdaq")).rejects.toThrow(ShareError);
    expect(prismaMock.achievementShare.create).not.toHaveBeenCalled();
  });

  it("mints a real share token once the asset is genuinely unlocked", async () => {
    getServerLearningProgress.mockResolvedValue(progress({ completedLessons: ["sp500", "nasdaq"] }));
    const { shareToken } = await shareAssetUnlock("user-1", "nasdaq");
    expect(shareToken).toMatch(/^[a-f0-9]{32}$/);
    expect(prismaMock.achievementShare.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1", assetId: "nasdaq" }) })
    );
  });

  it("rejects an unknown assetId", async () => {
    await expect(shareAssetUnlock("user-1", "doge")).rejects.toThrow(ShareError);
    expect(prismaMock.achievementShare.create).not.toHaveBeenCalled();
  });
});

describe("shareAchievement — never shares an unearned achievement", () => {
  it("refuses to mint a share token for an achievement not in the user's real unlocked list", async () => {
    getServerLearningProgress.mockResolvedValue(progress({ unlockedAchievements: [] }));
    await expect(shareAchievement("user-1", "FIRST_LESSON")).rejects.toThrow(ShareError);
    expect(prismaMock.achievementShare.create).not.toHaveBeenCalled();
  });

  it("mints a real share token once the achievement is genuinely unlocked", async () => {
    getServerLearningProgress.mockResolvedValue(progress({ unlockedAchievements: ["FIRST_LESSON"] }));
    const { shareToken } = await shareAchievement("user-1", "FIRST_LESSON");
    expect(shareToken).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rejects an unknown achievementId", async () => {
    await expect(shareAchievement("user-1", "NOT_REAL")).rejects.toThrow(ShareError);
  });
});

describe("getPublicShare — never leaks private data", () => {
  it("returns only public-safe fields for an asset-unlock share", async () => {
    prismaMock.achievementShare.findUnique.mockResolvedValue({
      achievementId: "INVESTMENT_UNLOCKED",
      assetId: "nasdaq",
      user: { name: "Alex Johnson", locale: "fr" },
    });
    const share = await getPublicShare("some-token");
    expect(share).toEqual({
      achievementId: "INVESTMENT_UNLOCKED",
      assetId: "nasdaq",
      assetName: "Nasdaq 100",
      achievementTitle: null,
      sharerName: "Alex Johnson",
      locale: "fr",
    });
    // No email, no internal id, no portfolio/holdings field anywhere.
    expect(Object.keys(share!)).not.toContain("email");
    expect(Object.keys(share!)).not.toContain("userId");
    expect(Object.keys(share!)).not.toContain("portfolioValue");
  });

  it("falls back to a generic display name when the user has none", async () => {
    prismaMock.achievementShare.findUnique.mockResolvedValue({
      achievementId: "FIRST_LESSON",
      assetId: null,
      user: { name: null, locale: null },
    });
    const share = await getPublicShare("some-token");
    expect(share?.sharerName).toBe("A CompassFinance learner");
  });

  it("defaults locale to English when the sharer has none set, and never leaks an unsupported locale value through", async () => {
    prismaMock.achievementShare.findUnique.mockResolvedValue({
      achievementId: "FIRST_LESSON",
      assetId: null,
      user: { name: "Alex", locale: null },
    });
    expect((await getPublicShare("some-token"))?.locale).toBe("en");

    prismaMock.achievementShare.findUnique.mockResolvedValue({
      achievementId: "FIRST_LESSON",
      assetId: null,
      user: { name: "Alex", locale: "de" },
    });
    expect((await getPublicShare("some-token"))?.locale).toBe("en");
  });

  it("returns null for a token that doesn't exist", async () => {
    prismaMock.achievementShare.findUnique.mockResolvedValue(null);
    expect(await getPublicShare("not-a-real-token")).toBeNull();
  });
});
