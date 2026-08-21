import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { listFavorites, addFavorite } from "@/server/repositories/favorites-repository";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return { favorites: await listFavorites(userId) };
  });
}

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { assetId } = await req.json();
    return { favorites: await addFavorite(userId, assetId) };
  });
}
