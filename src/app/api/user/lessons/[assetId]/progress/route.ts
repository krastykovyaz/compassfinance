import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { saveLessonStepProgress } from "@/server/services/learning-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { assetId } = await params;
    const { stepIndex } = await req.json();
    if (typeof stepIndex !== "number" || stepIndex < 0) {
      throw new Error("stepIndex must be a non-negative number");
    }
    await saveLessonStepProgress(userId, assetId, stepIndex);
    return { ok: true };
  });
}
