import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { shareAchievement } from "@/server/services/achievement-sharing-service";
import { buildAchievementShareUrl, getRequestOrigin } from "@/lib/referrals/urls";

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { achievementId } = await req.json();
    if (typeof achievementId !== "string" || !achievementId) {
      throw new Error("achievementId is required");
    }
    const { shareToken } = await shareAchievement(userId, achievementId);
    return { url: buildAchievementShareUrl(getRequestOrigin(req), shareToken) };
  });
}
