import "server-only";
import {
  createNotificationOnce,
  getNotificationChannelPreferences,
  listPushSubscriptionsForUser,
} from "@/server/repositories/notifications-repository";
import { getProfile } from "@/server/repositories/profile-repository";
import { sendPushToUser } from "./push-sender";
import { buildPushPayload } from "@/lib/notifications/format-notification";
import type { NotificationChannel, NotificationEventType } from "@/server/validation";

export type { NotificationEventType };

export type NotificationEventResult = {
  eligible: boolean;
  channels: NotificationChannel[];
};

/**
 * Persists a real product event as a notification row (deduped — see
 * createNotificationOnce) and, if the user has push enabled and at least
 * one valid subscription, attempts a best-effort push send. In-app
 * notification-center visibility is unconditional on any real event
 * happening; push is a separate, gated delivery concern layered on top.
 *
 * Never throws — a notification-side failure must never fail the request
 * that triggered the underlying product event (lesson completed, trade
 * executed, etc.), so every call site awaits this fire-and-forget style.
 */
export async function notifyUser(
  userId: string,
  eventType: NotificationEventType,
  sourceId: string,
  extra?: { assetId?: string; tradeSide?: "BUY" | "SELL" }
): Promise<NotificationEventResult> {
  try {
    const notification = await createNotificationOnce(userId, eventType, sourceId, extra);
    if (!notification) {
      // Same (userId, eventType, sourceId) already notified — this IS the
      // duplicate-event guard; no new row, no new push.
      return { eligible: false, channels: [] };
    }

    const channels = await getNotificationChannelPreferences(userId);
    const enabledChannels = (Object.keys(channels) as NotificationChannel[]).filter(
      (c) => channels[c]
    );

    if (enabledChannels.includes("push")) {
      const subs = await listPushSubscriptionsForUser(userId);
      if (subs.length > 0) {
        const profile = await getProfile(userId);
        await sendPushToUser(userId, buildPushPayload(notification, profile.locale ?? "en"), subs);
      } else if (process.env.NODE_ENV !== "production") {
        console.info(
          `[notification-events] ${eventType}:${sourceId} user=${userId} push enabled but no subscriptions — nothing to send to`
        );
      }
    }

    return { eligible: enabledChannels.length > 0, channels: enabledChannels };
  } catch (err) {
    console.error("[notification-events] failed to evaluate event", eventType, err);
    return { eligible: false, channels: [] };
  }
}
