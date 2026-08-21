import "server-only";
import { getNotificationChannelPreferences } from "@/server/repositories/notifications-repository";
import type { NotificationChannel } from "@/server/validation";

// Real product events this milestone wires notifications to (Section 1).
// Streak milestones are already modeled as the SEVEN_DAY_STREAK achievement
// (see lib/learning/achievements.ts) — they go through "achievement_earned"
// rather than a second, invented "streak" event/threshold.
export type NotificationEventType =
  | "learning_completed"
  | "investment_unlocked"
  | "achievement_earned"
  | "paper_trade_completed";

export type NotificationEventResult = {
  eligible: boolean;
  channels: NotificationChannel[];
};

/**
 * Gates a real product event against the user's real channel preferences.
 * There is no push/email delivery provider configured yet, so this is
 * deliberately a preference-check + integration point, not a sender — it
 * never reports or logs a message as having been delivered. Once a real
 * provider is wired up, it plugs in at the single console.info call below
 * without any call site here needing to change.
 *
 * Never throws — a notification-side failure must never fail the request
 * that triggered the underlying product event (lesson completed, trade
 * executed, etc.), so every call site awaits this fire-and-forget style.
 */
export async function notifyUser(
  userId: string,
  eventType: NotificationEventType,
  sourceId: string
): Promise<NotificationEventResult> {
  try {
    const channels = await getNotificationChannelPreferences(userId);
    const enabledChannels = (Object.keys(channels) as NotificationChannel[]).filter(
      (c) => channels[c]
    );

    if (enabledChannels.length === 0) {
      return { eligible: false, channels: [] };
    }

    // Diagnostic only — deliberately not presented to the user as "sent".
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[notification-events] ${eventType}:${sourceId} user=${userId} eligible channels=${enabledChannels.join(
          ", "
        )} (no delivery provider configured — not actually sent)`
      );
    }

    return { eligible: true, channels: enabledChannels };
  } catch (err) {
    console.error("[notification-events] failed to evaluate event", eventType, err);
    return { eligible: false, channels: [] };
  }
}
