import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { submitQuiz } from "@/server/services/learning-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { assetId } = await params;
    const { attemptId, answers } = await req.json();

    if (typeof attemptId !== "string" || !Array.isArray(answers)) {
      throw new Error("attemptId (string) and answers (array) are required");
    }

    const { grade, progress, alreadySubmitted } = await submitQuiz(
      userId,
      assetId,
      attemptId,
      answers
    );

    // Per-question correctness is fine to return (the learner already
    // answered); the answer key/options themselves are never included.
    return { grade, progress, alreadySubmitted };
  });
}
