import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { completeLesson } from "@/server/services/learning-service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { assetId } = await params;
    return { progress: await completeLesson(userId, assetId) };
  });
}
