import "server-only";
import webpush from "web-push";
import { deletePushSubscription, type PushSubscriptionRow } from "@/server/repositories/notifications-repository";

// Real Web Push delivery — no third-party provider account needed (unlike
// email/Resend), just a self-generated VAPID keypair. If that keypair
// isn't configured, this deliberately skips sending rather than pretending
// a message went out (Notifications milestone, Section 3).

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

/**
 * Sends one push message to every one of a user's subscriptions. Never
 * throws — matches notifyUser()'s fire-and-forget contract, a push failure
 * must never surface as a failed request. A subscription the push service
 * reports as gone (404/410 — uninstalled, permission revoked, storage
 * cleared) is removed so it's never retried.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; href: string },
  subs: PushSubscriptionRow[]
): Promise<void> {
  if (!ensureVapidConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[push-sender] VAPID not configured — skipping push for user=${userId} (no infra, not pretending success)`
      );
    }
    return;
  }

  const message = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deletePushSubscription(sub.endpoint);
        } else {
          console.error("[push-sender] send failed", statusCode, err);
        }
      }
    })
  );
}
