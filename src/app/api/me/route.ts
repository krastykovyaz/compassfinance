import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { getProfile } from "@/server/repositories/profile-repository";
import { listInterests } from "@/server/repositories/interests-repository";
import { listFavorites } from "@/server/repositories/favorites-repository";
import { getNotificationPreferences } from "@/server/repositories/notifications-repository";
import {
  getServerLearningProgress,
  getAssetProgressMap,
} from "@/server/repositories/learning-repository";

/**
 * The one request an authenticated client needs on load to hydrate every
 * piece of server-owned user state (Section 16) — avoids the N+1 pattern
 * of separately GET-ing profile/interests/favorites/notifications/progress
 * on every page. Individual per-domain routes (/api/user/profile,
 * /api/user/interests, etc.) still exist for targeted reads/writes after
 * a mutation; this one is specifically for the initial-load hydration
 * path in progress-store.tsx.
 */
export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();

    const [profile, interests, favorites, notificationPreferences, progress, assetProgress] =
      await Promise.all([
        getProfile(userId),
        listInterests(userId),
        listFavorites(userId),
        getNotificationPreferences(userId),
        getServerLearningProgress(userId),
        getAssetProgressMap(userId),
      ]);

    return {
      user: { id: userId, ...profile },
      interests,
      favorites: favorites.map((f) => f.assetId),
      notificationPreferences,
      progress,
      assetProgress,
    };
  });
}
