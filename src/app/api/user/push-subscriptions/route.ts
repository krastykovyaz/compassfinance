import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import {
  upsertPushSubscription,
  deletePushSubscription,
  listPushSubscriptionsForUser,
} from "@/server/repositories/notifications-repository";

// Body shape matches the browser's native PushSubscription.toJSON():
// { endpoint, keys: { p256dh, auth } }.
export async function POST(req: Request) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
      throw new Error("A valid push subscription (endpoint, keys.p256dh, keys.auth) is required");
    }
    const userAgent = req.headers.get("user-agent") ?? undefined;
    await upsertPushSubscription(userId, { endpoint, p256dh, auth, userAgent });
    return { ok: true };
  });
}

export async function DELETE(req: Request) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { endpoint } = await req.json();
    if (typeof endpoint !== "string" || !endpoint) {
      throw new Error("endpoint is required");
    }
    // Only ever delete a subscription that actually belongs to the
    // authenticated user — a signed-in user can't blind-delete another
    // user's subscription by guessing/replaying an endpoint value.
    const owned = await listPushSubscriptionsForUser(userId);
    if (!owned.some((s) => s.endpoint === endpoint)) {
      return { ok: true };
    }
    await deletePushSubscription(endpoint);
    return { ok: true };
  });
}
