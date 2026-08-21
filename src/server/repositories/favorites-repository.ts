import "server-only";
import { prisma } from "@/server/db/prisma";

export type FavoriteDTO = { assetId: string; createdAt: string };

export async function listFavorites(userId: string): Promise<FavoriteDTO[]> {
  const rows = await prisma.userFavoriteAsset.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ assetId: r.assetId, createdAt: r.createdAt.toISOString() }));
}

// A favorite does NOT unlock an asset and does NOT imply investability —
// this repository only ever reads/writes the favorites table, nothing else
// (Section 16). Works identically for locked and unlocked assets since
// there's no unlock-status check here at all.
export async function addFavorite(userId: string, assetId: string): Promise<FavoriteDTO[]> {
  if (!assetId || typeof assetId !== "string") {
    throw new Error("assetId is required");
  }
  await prisma.userFavoriteAsset.upsert({
    where: { userId_assetId: { userId, assetId } },
    create: { userId, assetId },
    update: {},
  });
  return listFavorites(userId);
}

export async function removeFavorite(userId: string, assetId: string): Promise<FavoriteDTO[]> {
  await prisma.userFavoriteAsset.deleteMany({ where: { userId, assetId } });
  return listFavorites(userId);
}
