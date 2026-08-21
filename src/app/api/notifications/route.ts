import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { listNotifications, getUnreadNotificationCount } from "@/server/repositories/notifications-repository";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(userId),
      getUnreadNotificationCount(userId),
    ]);
    return { notifications, unreadCount };
  });
}
