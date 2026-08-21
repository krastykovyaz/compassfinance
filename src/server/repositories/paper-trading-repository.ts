import { prisma } from "@/server/db/prisma";
import { PAPER_TRADING_STARTING_BALANCE } from "@/lib/trading/config";
import { TradeSide } from "@/lib/trading/types";

type DbTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$use" | "$extends">;

export type PaperAccountRow = {
  id: string;
  userId: string;
  cashBalance: number;
};

export type PaperPositionRow = {
  id: string;
  accountId: string;
  assetId: string;
  quantity: number;
  averageEntryPrice: number;
};

export type PaperTradeRow = {
  id: string;
  accountId: string;
  assetId: string;
  side: string;
  quantity: number;
  executionPrice: number;
  realizedPnl: number | null;
  createdAt: Date;
};

/**
 * Returns the user's paper account, creating one with the standard
 * starting balance if this is their first time — never a second/random
 * starting balance (see PAPER_TRADING_STARTING_BALANCE). Idempotent: a
 * concurrent double-create is prevented by the unique constraint on
 * userId, and the (rare) resulting P2002 is retried as a plain lookup.
 */
export async function getOrCreateAccount(
  tx: DbTransaction,
  userId: string
): Promise<PaperAccountRow> {
  const existing = await tx.paperAccount.findUnique({ where: { userId } });
  if (existing) return existing;

  try {
    return await tx.paperAccount.create({
      data: { userId, cashBalance: PAPER_TRADING_STARTING_BALANCE },
    });
  } catch {
    const raceWinner = await tx.paperAccount.findUnique({ where: { userId } });
    if (raceWinner) return raceWinner;
    throw new Error("Failed to create paper account");
  }
}

export async function getPositions(
  tx: DbTransaction,
  accountId: string
): Promise<PaperPositionRow[]> {
  return tx.paperPosition.findMany({ where: { accountId } });
}

export async function getPosition(
  tx: DbTransaction,
  accountId: string,
  assetId: string
): Promise<PaperPositionRow | null> {
  return tx.paperPosition.findUnique({
    where: { accountId_assetId: { accountId, assetId } },
  });
}

export async function getTrades(
  tx: DbTransaction,
  accountId: string,
  limit = 100
): Promise<PaperTradeRow[]> {
  return tx.paperTrade.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function updateCashBalance(
  tx: DbTransaction,
  accountId: string,
  cashBalance: number
): Promise<void> {
  await tx.paperAccount.update({ where: { id: accountId }, data: { cashBalance } });
}

export async function upsertPosition(
  tx: DbTransaction,
  accountId: string,
  assetId: string,
  quantity: number,
  averageEntryPrice: number
): Promise<void> {
  await tx.paperPosition.upsert({
    where: { accountId_assetId: { accountId, assetId } },
    create: { accountId, assetId, quantity, averageEntryPrice },
    update: { quantity, averageEntryPrice },
  });
}

export async function deletePosition(
  tx: DbTransaction,
  accountId: string,
  assetId: string
): Promise<void> {
  await tx.paperPosition.deleteMany({ where: { accountId, assetId } });
}

export type PaperSnapshotRow = {
  id: string;
  accountId: string;
  portfolioValue: number;
  cashBalance: number;
  createdAt: Date;
};

export async function getLatestSnapshot(
  tx: DbTransaction,
  accountId: string
): Promise<PaperSnapshotRow | null> {
  return tx.paperAccountSnapshot.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSnapshot(
  tx: DbTransaction,
  accountId: string,
  portfolioValue: number,
  cashBalance: number
): Promise<PaperSnapshotRow> {
  return tx.paperAccountSnapshot.create({
    data: { accountId, portfolioValue, cashBalance },
  });
}

export async function getSnapshotsSince(
  tx: DbTransaction,
  accountId: string,
  since: Date | null
): Promise<PaperSnapshotRow[]> {
  return tx.paperAccountSnapshot.findMany({
    where: since ? { accountId, createdAt: { gte: since } } : { accountId },
    orderBy: { createdAt: "asc" },
  });
}

export async function recordTrade(
  tx: DbTransaction,
  params: {
    accountId: string;
    assetId: string;
    side: TradeSide;
    quantity: number;
    executionPrice: number;
    realizedPnl: number | null;
  }
): Promise<PaperTradeRow> {
  return tx.paperTrade.create({ data: params });
}
