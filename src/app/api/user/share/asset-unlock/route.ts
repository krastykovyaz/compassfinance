import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { shareAssetUnlock } from "@/server/services/achievement-sharing-service";
import { buildAchievementShareUrl } from "@/lib/referrals/urls";

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { assetId } = await req.json();
    if (typeof assetId !== "string" || !assetId) {
      throw new Error("assetId is required");
    }
    const { shareToken } = await shareAssetUnlock(userId, assetId);
    return { url: buildAchievementShareUrl(req.nextUrl.origin, shareToken) };
  });
}
