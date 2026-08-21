import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { removeInterest } from "@/server/repositories/interests-repository";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { key } = await params;
    return { interests: await removeInterest(userId, key) };
  });
}
