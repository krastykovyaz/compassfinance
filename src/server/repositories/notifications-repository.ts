import "server-only";
import { prisma } from "@/server/db/prisma";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  isValidNotificationCategory,
  isValidNotificationChannel,
  type NotificationCategory,
  type NotificationChannel,
} from "@/server/validation";

export type { NotificationCategory, NotificationChannel };
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
  email: true,
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
