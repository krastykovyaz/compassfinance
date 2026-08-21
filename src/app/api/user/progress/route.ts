import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { getServerLearningProgress } from "@/server/repositories/learning-repository";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return { progress: await getServerLearningProgress(userId) };
  });
}
