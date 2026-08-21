// Pure notification-content formatting — no React, no fetch. Used both by
// the client (rendering the notification list in the user's active locale)
// and server-side (building a localized push payload from the user's saved
// locale), so it must never import anything client-only or server-only.
//
// Every displayed name is resolved from real application state (the asset
// catalog / achievement definitions / their localized-content overrides) —
// never a hardcoded string, matching the existing fallback idiom already
// used in achievement-card.tsx: `localized?.title ?? achievement.title`.

import { getAsset } from "@/lib/assets/catalog";
import { getAchievement } from "@/lib/learning/achievements";
import { getLocalizedAchievementText, getLocalizedUnlockText } from "@/lib/learning/content/localization";
import { getLessonHref } from "@/lib/learning/routes";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";
import type { NotificationEventType } from "@/server/validation";

/** Structurally compatible with (but intentionally decoupled from) the
 * repository's NotificationDTO — this module must stay importable from
 * client components, and notifications-repository.ts is server-only. */
export type NotificationLike = {
  type: NotificationEventType;
  sourceId: string;
  assetId: string | null;
  achievementId: string | null;
  tradeSide: "BUY" | "SELL" | null;
};

export type FormattedNotification = {
  title: string;
  body: string;
  href: string;
};

function getLocalizedAssetName(assetId: string, locale: Locale): string {
  return getLocalizedUnlockText(assetId, locale)?.name ?? getAsset(assetId)?.name ?? assetId;
}

function getLocalizedAchievementTitle(achievementId: string, locale: Locale): string {
  return (
    getLocalizedAchievementText(achievementId, locale)?.title ??
    getAchievement(achievementId)?.title ??
    achievementId
  );
}

export function formatNotification(n: NotificationLike, locale: Locale): FormattedNotification {
  const t = (key: string) => translate(locale, key);

  switch (n.type) {
    case "learning_completed": {
      const assetId = n.assetId ?? n.sourceId;
      return {
        title: t("notifications.eventCourseCompletedTitle"),
        body: getLocalizedAssetName(assetId, locale),
        href: getLessonHref(assetId),
      };
    }
    case "investment_unlocked": {
      const assetId = n.assetId ?? n.sourceId;
      const assetName = getLocalizedAssetName(assetId, locale);
      return {
        title: t("notifications.eventInvestmentUnlockedTemplate").replace("{asset}", assetName),
        body: assetName,
        href: `/asset/${assetId}`,
      };
    }
    case "paper_trade_completed": {
      const assetId = n.assetId ?? "";
      const assetName = getLocalizedAssetName(assetId, locale);
      const sideKey =
        n.tradeSide === "SELL"
          ? "notifications.eventTradeSoldTemplate"
          : "notifications.eventTradeBoughtTemplate";
      return {
        title: t("notifications.eventPaperTradeExecutedTitle"),
        body: t(sideKey).replace("{asset}", assetName),
        href: `/position/${assetId}`,
      };
    }
    case "achievement_earned": {
      const achievementId = n.achievementId ?? n.sourceId;
      const isStreak = achievementId === "SEVEN_DAY_STREAK";
      return {
        title: isStreak
          ? t("notifications.eventStreakMilestoneTitle")
          : t("notifications.eventAchievementUnlockedTitle"),
        body: getLocalizedAchievementTitle(achievementId, locale),
        href: "/learn",
      };
    }
  }
}

/** Builds the push-notification payload for a just-created notification,
 * in the given locale (the user's saved locale — see notification-events.ts). */
export function buildPushPayload(n: NotificationLike, locale: Locale = "en"): FormattedNotification {
  return formatNotification(n, locale);
}
