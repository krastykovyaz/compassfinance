import { randomBytes } from "crypto";
import { prisma } from "@/server/db/prisma";
import { getServerLearningProgress } from "@/server/repositories/learning-repository";
import { getInvestmentAccess } from "@/lib/learning/unlocks";
import { getAsset, isAssetId } from "@/lib/assets/catalog";
import { getAchievement } from "@/lib/learning/achievements";
import { toSupportedLocale } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

export class ShareError extends Error {}

const TOKEN_LENGTH = 16;

function generateShareToken(): string {
  return randomBytes(TOKEN_LENGTH).toString("hex");
}

/**
 * Mints a share token for a real investment-unlock event. Re-verifies
 * server-side, from the same isInvestmentUnlocked()/getInvestmentAccess()
 * source everything else uses, that this asset is genuinely unlocked for
 * this user right now — a client can never claim/share an unlock it
 * hasn't actually earned, regardless of what it sends.
 */
export async function shareAssetUnlock(
  userId: string,
  assetId: string
): Promise<{ shareToken: string }> {
  if (!isAssetId(assetId)) {
    throw new ShareError(`Unknown asset: ${assetId}`);
  }
  const asset = getAsset(assetId);
  if (!asset) throw new ShareError(`Unknown asset: ${assetId}`);

  const progress = await getServerLearningProgress(userId);
  const status = getInvestmentAccess(assetId, progress);
  if (status !== "UNLOCKED") {
    throw new ShareError(`${asset.name} isn't unlocked yet — nothing to share.`);
  }

  const shareToken = generateShareToken();
  await prisma.achievementShare.create({
    data: {
      userId,
      achievementId: "INVESTMENT_UNLOCKED", // synthetic id for an asset-unlock share, distinct from the ACHIEVEMENTS registry ids
      assetId,
      shareToken,
    },
  });
  return { shareToken };
}

/**
 * Mints a share token for a real, already-unlocked achievement (from the
 * canonical ACHIEVEMENTS registry) — re-verifies the achievement is
 * actually in the user's persisted unlockedAchievements before minting
 * anything.
 */
export async function shareAchievement(
  userId: string,
  achievementId: string
): Promise<{ shareToken: string }> {
  const achievement = getAchievement(achievementId);
  if (!achievement) throw new ShareError(`Unknown achievement: ${achievementId}`);

  const progress = await getServerLearningProgress(userId);
  if (!progress.unlockedAchievements.includes(achievementId)) {
    throw new ShareError(`${achievement.title} hasn't been earned yet — nothing to share.`);
  }

  const shareToken = generateShareToken();
  await prisma.achievementShare.create({
    data: { userId, achievementId, assetId: null, shareToken },
  });
  return { shareToken };
}

export type PublicShare = {
  achievementId: string;
  assetId: string | null;
  assetName: string | null;
  achievementTitle: string | null;
  /** A public display name only — never email, never internal user id. */
  sharerName: string;
  /** The sharer's own account language — so whoever opens this link sees
   * it in the same language the sharer was using, not their own browser
   * default. Never falls back to anything other than a supported Locale. */
  locale: Locale;
};

/**
 * Reads back a share for the public page. Only ever returns public-safe
 * fields — never portfolio value, holdings, trading history, email, or
 * any internal id. `sharerName` falls back to a generic label when the
 * user has no public display name, per Milestone 24 Section 6.
 */
export async function getPublicShare(shareToken: string): Promise<PublicShare | null> {
  const share = await prisma.achievementShare.findUnique({
    where: { shareToken },
    select: {
      achievementId: true,
      assetId: true,
      user: { select: { name: true, locale: true } },
    },
  });
  if (!share) return null;

  const asset = share.assetId && isAssetId(share.assetId) ? getAsset(share.assetId) : null;
  const achievement =
    share.achievementId === "INVESTMENT_UNLOCKED" ? null : getAchievement(share.achievementId);

  return {
    achievementId: share.achievementId,
    assetId: asset?.id ?? null,
    assetName: asset?.name ?? null,
    achievementTitle: achievement?.title ?? null,
    sharerName: share.user.name?.trim() || "A CompassFinance learner",
    locale: toSupportedLocale(share.user.locale),
  };
}
