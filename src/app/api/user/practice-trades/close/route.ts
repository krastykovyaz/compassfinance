import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { closePracticeTrade } from "@/server/services/learning-service";

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { tradeId } = await req.json();
    if (typeof tradeId !== "string" || !tradeId) {
      throw new Error("tradeId is required");
    }
    const { progress, alreadyRecorded } = await closePracticeTrade(userId, tradeId);
    return { progress, alreadyRecorded };
  });
}
