import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { removeFavorite } from "@/server/repositories/favorites-repository";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { assetId } = await params;
    return { favorites: await removeFavorite(userId, assetId) };
  });
}
