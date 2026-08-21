import "server-only";
import { prisma } from "@/server/db/prisma";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  isValidNotificationCategory,
  isValidNotificationChannel,
  isValidNotificationEventType,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationEventType,
} from "@/server/validation";

export type { NotificationCategory, NotificationChannel, NotificationEventType };
export { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS };

export type NotificationPreferencesDTO = Record<NotificationCategory, boolean>;
export type NotificationChannelPreferencesDTO = Record<NotificationChannel, boolean>;

const DEFAULTS: NotificationPreferencesDTO = {
  news: true,
  priceAlerts: true,
  learning: true,
  achievements: true,
};

// Channel rows share the same table/column as content categories, just
// under a "channel:" prefix in `category` — this is still the one
// notification-preferences state, not a second one. Opt-out defaults
// (both on) match the existing category defaults above; no delivery is
// implied by "on" — see notification-events.ts.
const CHANNEL_PREFIX = "channel:";

const CHANNEL_DEFAULTS: NotificationChannelPreferencesDTO = {
  push: true,
};

export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferencesDTO> {
  const rows = await prisma.userNotificationPreference.findMany({ where: { userId } });
  const result = { ...DEFAULTS };
  for (const row of rows) {
    if (isValidNotificationCategory(row.category)) {
      result[row.category] = row.enabled;
    }
  }
  return result;
}

export async function setNotificationPreference(
  userId: string,
  category: string,
  enabled: boolean
): Promise<NotificationPreferencesDTO> {
  if (!isValidNotificationCategory(category)) {
    throw new Error(`Invalid notification category: ${category}`);
  }
  await prisma.userNotificationPreference.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, enabled },
    update: { enabled },
  });
  return getNotificationPreferences(userId);
}

export async function getNotificationChannelPreferences(
  userId: string
): Promise<NotificationChannelPreferencesDTO> {
  const rows = await prisma.userNotificationPreference.findMany({
    where: { userId, category: { in: NOTIFICATION_CHANNELS.map((c) => CHANNEL_PREFIX + c) } },
  });
  const result = { ...CHANNEL_DEFAULTS };
  for (const row of rows) {
    const channel = row.category.slice(CHANNEL_PREFIX.length);
    if (isValidNotificationChannel(channel)) {
      result[channel] = row.enabled;
    }
  }
  return result;
}

export async function setNotificationChannelPreference(
  userId: string,
  channel: string,
  enabled: boolean
): Promise<NotificationChannelPreferencesDTO> {
  if (!isValidNotificationChannel(channel)) {
    throw new Error(`Invalid notification channel: ${channel}`);
  }
  const category = CHANNEL_PREFIX + channel;
  await prisma.userNotificationPreference.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, enabled },
    update: { enabled },
  });
  return getNotificationChannelPreferences(userId);
}

// ---------------------------------------------------------------------------
// Notification center — real, persisted notification rows. Separate from
// the preferences above: this is "X actually happened", not "would the
// user want to hear about X".
// ---------------------------------------------------------------------------

export type NotificationDTO = {
  id: string;
  type: NotificationEventType;
  sourceId: string;
  assetId: string | null;
  achievementId: string | null;
  tradeSide: "BUY" | "SELL" | null;
  read: boolean;
  createdAt: string;
};

function toNotificationDTO(row: {
  id: string;
  type: string;
  sourceId: string;
  assetId: string | null;
  achievementId: string | null;
  tradeSide: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDTO {
  return {
    id: row.id,
    type: row.type as NotificationEventType,
    sourceId: row.sourceId,
    assetId: row.assetId,
    achievementId: row.achievementId,
    tradeSide: row.tradeSide as "BUY" | "SELL" | null,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Creates a notification row for a real event, exactly once per
 * (userId, type, sourceId) — the unique constraint on Notification makes a
 * second call for the same event a silent, idempotent no-op (returns null)
 * rather than a duplicate row. Mirrors the exact try/catch-on-unique-
 * constraint idiom already used for achievement/asset-unlock persistence
 * in learning-service.ts's applyDerivedUnlocks().
 */
export async function createNotificationOnce(
  userId: string,
  type: NotificationEventType,
  sourceId: string,
  extra?: { assetId?: string; tradeSide?: "BUY" | "SELL" }
): Promise<NotificationDTO | null> {
  if (!isValidNotificationEventType(type)) {
    throw new Error(`Invalid notification event type: ${type}`);
  }
  const assetId =
    extra?.assetId ??
    (type === "learning_completed" || type === "investment_unlocked" ? sourceId : undefined);
  const achievementId = type === "achievement_earned" ? sourceId : undefined;

  try {
    const row = await prisma.notification.create({
      data: {
        userId,
        type,
        sourceId,
        assetId: assetId ?? null,
        achievementId: achievementId ?? null,
        tradeSide: extra?.tradeSide ?? null,
      },
    });
    return toNotificationDTO(row);
  } catch {
    // Unique constraint on (userId, type, sourceId) — already notified.
    return null;
  }
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationDTO[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toNotificationDTO);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Ownership is enforced in the query itself (id AND userId must both
 * match) — a user can never mark another user's notification read even by
 * guessing an id; a mismatched id/userId is a silent no-op. */
export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Push subscriptions — one row per browser/device with push permission
// granted. Never returns endpoint/keys to a client that doesn't own them.
// ---------------------------------------------------------------------------

export type PushSubscriptionRow = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function upsertPushSubscription(
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string }
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      userAgent: sub.userAgent ?? null,
    },
    update: {
      userId,
      p256dh: sub.p256dh,
      auth: sub.auth,
      userAgent: sub.userAgent ?? null,
    },
  });
}

/** Removes a subscription by its endpoint — used both for a user's own
 * unsubscribe action and for server-side cleanup after a push send comes
 * back "gone" (404/410); a dead endpoint is dead regardless of who owned
 * it, so no userId scoping is needed here (callers that must verify
 * ownership before deleting do so themselves via listPushSubscriptionsForUser). */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function listPushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRow[]> {
  return prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
  });
}
