import "server-only";
import { prisma } from "@/server/db/prisma";

const PROVIDER = "INTERACTIVE_BROKERS";

export type InteractiveBrokersAccountDTO = {
  currencyCode: string | null;
  totalValue: number | null;
  cashAvailable: number | null;
  investedValue: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
};

export type InteractiveBrokersPositionDTO = {
  compassAssetId: string | null;
  externalId: string; // IBKR's own conid, stringified — see BrokeragePosition's schema comment
  externalTicker: string; // IBKR's own description/contractDesc — a raw label, not always a real ticker
  externalName: string | null;
  currencyCode: string | null;
  quantity: number;
  averagePrice: number | null;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  assetClass: string | null;
  sector: string | null;
  expiry: string | null;
  strike: number | null;
  multiplier: number | null;
  underlyingConid: string | null;
};

export type InteractiveBrokersSyncStatusDTO = "NEVER_SYNCED" | "SYNCING" | "SYNCED" | "FAILED";

export type InteractiveBrokersPortfolioDTO = {
  /** IBKR's own real account number, discovered via /portfolio/accounts —
   * null until the first successful sync has run (Phase 1's connection
   * step never populates it; see BrokerageConnection.externalAccountId's
   * own schema comment). */
  accountId: string | null;
  account: InteractiveBrokersAccountDTO | null;
  positions: InteractiveBrokersPositionDTO[];
  lastSyncAt: string | null;
  syncStatus: InteractiveBrokersSyncStatusDTO;
  syncError: string | null;
  lastFailedSyncAt: string | null;
  connectionStatus: "CONNECTED" | "DISCONNECTED" | "ERROR";
};

/** Read-only view for the Portfolio page's Interactive Brokers section —
 * mirrors getTrading212Portfolio's exact contract: returns `null` when
 * the user has no IBKR connection at all (distinct from "connected but
 * never synced," which returns `{ accountId: null, account: null,
 * positions: [] }"), scoped by userId, single round-trip alongside the
 * account+positions fetch (no N+1). */
export async function getInteractiveBrokersPortfolio(userId: string): Promise<InteractiveBrokersPortfolioDTO | null> {
  const connection = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!connection) return null;

  const [account, positions] = await Promise.all([
    prisma.brokerageAccount.findUnique({ where: { brokerageConnectionId: connection.id } }),
    prisma.brokeragePosition.findMany({
      where: { userId, brokerageConnectionId: connection.id },
      orderBy: { externalTicker: "asc" },
    }),
  ]);

  return {
    accountId: connection.externalAccountId,
    lastSyncAt: connection.lastSyncAt ? connection.lastSyncAt.toISOString() : null,
    syncStatus: connection.syncStatus as InteractiveBrokersSyncStatusDTO,
    syncError: connection.syncError,
    lastFailedSyncAt: connection.lastFailedSyncAt ? connection.lastFailedSyncAt.toISOString() : null,
    connectionStatus: connection.status as InteractiveBrokersPortfolioDTO["connectionStatus"],
    account: account
      ? {
          currencyCode: account.currencyCode,
          totalValue: account.totalValue,
          cashAvailable: account.cashAvailable,
          investedValue: account.investedValue,
          realizedPnl: account.realizedPnl,
          unrealizedPnl: account.unrealizedPnl,
        }
      : null,
    positions: positions.map((p) => ({
      compassAssetId: p.compassAssetId,
      externalId: p.externalId,
      externalTicker: p.externalTicker,
      externalName: p.externalName,
      currencyCode: p.currencyCode,
      quantity: p.quantity,
      averagePrice: p.averagePrice,
      currentPrice: p.currentPrice,
      unrealizedPnl: p.unrealizedPnl,
      realizedPnl: p.realizedPnl,
      assetClass: p.assetClass,
      sector: p.sector,
      expiry: p.expiry,
      strike: p.strike,
      multiplier: p.multiplier,
      underlyingConid: p.underlyingConid,
    })),
  };
}
