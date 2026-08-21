import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { placePaperTrade } from "@/server/services/trading-service";

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const { assetId, side, quantity } = body ?? {};

    if (typeof assetId !== "string" || !assetId) {
      throw new Error("assetId is required");
    }
    if (side !== "BUY" && side !== "SELL") {
      throw new Error("side must be BUY or SELL");
    }
    if (typeof quantity !== "number") {
      throw new Error("quantity is required");
    }

    const account = await placePaperTrade(userId, assetId, side, quantity);
    return { account };
  });
}
