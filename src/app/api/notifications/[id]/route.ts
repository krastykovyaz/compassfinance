import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import {
  markNotificationRead,
  getUnreadNotificationCount,
} from "@/server/repositories/notifications-repository";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { id } = await params;
    // Ownership is enforced inside markNotificationRead's query itself
    // (id AND userId must both match) — an id belonging to another user
    // silently no-ops rather than erroring, never leaking its existence.
    await markNotificationRead(userId, id);
    return { unreadCount: await getUnreadNotificationCount(userId) };
  });
}
