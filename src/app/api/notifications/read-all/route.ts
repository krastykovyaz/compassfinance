import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { markAllNotificationsRead } from "@/server/repositories/notifications-repository";

export async function POST() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    await markAllNotificationsRead(userId);
    return { unreadCount: 0 };
  });
}
