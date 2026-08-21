import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import {
  getNotificationPreferences,
  setNotificationPreference,
  getNotificationChannelPreferences,
  setNotificationChannelPreference,
} from "@/server/repositories/notifications-repository";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const [preferences, channels] = await Promise.all([
      getNotificationPreferences(userId),
      getNotificationChannelPreferences(userId),
    ]);
    return { preferences, channels };
  });
}

// Accepts either a content category ({ category, enabled }) or a delivery
// channel ({ channel, enabled }) — same endpoint, same underlying
// preferences state, just two different callers (NotificationsCard's
// category toggles vs. its channel toggles).
export async function PATCH(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const { category, channel, enabled } = body as {
      category?: string;
      channel?: string;
      enabled: boolean;
    };

    if (channel) {
      const channels = await setNotificationChannelPreference(userId, channel, enabled);
      const preferences = await getNotificationPreferences(userId);
      return { preferences, channels };
    }

    const preferences = await setNotificationPreference(userId, category!, enabled);
    const channels = await getNotificationChannelPreferences(userId);
    return { preferences, channels };
  });
}
