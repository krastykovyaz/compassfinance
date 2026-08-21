import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { recordAssetView } from "@/server/repositories/learning-repository";

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { assetId } = await req.json();
    if (typeof assetId !== "string" || !assetId) {
      throw new Error("assetId is required");
    }
    await recordAssetView(userId, assetId);
    return { ok: true };
  });
}
