import "server-only";
import { prisma } from "@/server/db/prisma";
import type { InterestCategoryId } from "@/lib/interests/interests";
import { isValidInterestKey } from "@/server/validation";

export async function listInterests(userId: string): Promise<InterestCategoryId[]> {
  const rows = await prisma.userInterest.findMany({
    where: { userId },
    select: { key: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.key as InterestCategoryId);
}

export async function addInterest(userId: string, key: string): Promise<InterestCategoryId[]> {
  if (!isValidInterestKey(key)) {
    throw new Error(`Invalid interest key: ${key}`);
  }
  // Idempotent: (userId, key) is unique — adding twice yields one row.
  await prisma.userInterest.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key },
    update: {},
  });
  return listInterests(userId);
}

export async function removeInterest(userId: string, key: string): Promise<InterestCategoryId[]> {
  await prisma.userInterest.deleteMany({ where: { userId, key } });
  return listInterests(userId);
}
