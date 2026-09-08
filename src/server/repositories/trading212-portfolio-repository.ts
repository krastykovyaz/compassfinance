import "server-only";
import { prisma } from "@/server/db/prisma";

const PROVIDER = "trading212";

export type Trading212AccountDTO = {
  currencyCode: string | null;
  totalValue: number | null;
  cashAvailable: number | null;
  cashInPies: number | null;
  cashReserved: number | null;
  investedValue: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
};

export type Trading212PositionDTO = {
  compassAssetId: string | null;
  externalTicker: string;
  externalName: string | null;
  currencyCode: string | null;
  quantity: number;
  averagePrice: number | null;
  currentPrice: number | null;
  unrealizedPnl: number | null;
};

export type Trading212SyncStatusDTO = "NEVER_SYNCED" | "SYNCING" | "SYNCED" | "FAILED";

export type Trading212PortfolioDTO = {
  /** Trading 212's own real account number (from /equity/account/info at
   * connect time — see trading212-repository.ts's connectTrading212) —
   * never a CompassFinance-generated id. */
  accountId: string;
  account: Trading212AccountDTO | null;
  positions: Trading212PositionDTO[];
  lastSyncAt: string | null;
  syncStatus: Trading212SyncStatusDTO;
  syncError: string | null;
  /** Phase 5 — the most recent failed-attempt timestamp, distinct from
   * lastSyncAt (last SUCCESS). */
  lastFailedSyncAt: string | null;
  /** Phase 5 — the CONNECTED/ERROR distinction Requirement 12 wants
   * surfaced: ERROR means Trading 212 has explicitly rejected the stored
   * credentials (an AUTHENTICATION failure), not just "a sync happened to
   * fail once." */
  connectionStatus: "CONNECTED" | "DISCONNECTED" | "ERROR";
};

/** Read-only view for the Portfolio page's Trading 212 section. Returns
 * `null` when the user has no Trading 212 connection at all (distinct
 * from "connected but never synced," which returns `{ account: null,
 * positions: [] }`) so the UI can tell "nothing to show" apart from
 * "not connected." Always scoped by userId — see
 * api-routes-idor.test.ts's structural guardrail over the route that
 * calls this. Sync-state fields (lastSyncAt/syncStatus/syncError) come
 * off the SAME connection row already fetched here — no extra query, so
 * this stays a single round-trip alongside the account+positions fetch
 * below (Requirement 12: no N+1). */
export async function getTrading212Portfolio(userId: string): Promise<Trading212PortfolioDTO | null> {
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
    syncStatus: connection.syncStatus as Trading212SyncStatusDTO,
    syncError: connection.syncError,
    lastFailedSyncAt: connection.lastFailedSyncAt ? connection.lastFailedSyncAt.toISOString() : null,
    connectionStatus: connection.status as Trading212PortfolioDTO["connectionStatus"],
    account: account
      ? {
          currencyCode: account.currencyCode,
          totalValue: account.totalValue,
          cashAvailable: account.cashAvailable,
          cashInPies: account.cashInPies,
          cashReserved: account.cashReserved,
          investedValue: account.investedValue,
          realizedPnl: account.realizedPnl,
          unrealizedPnl: account.unrealizedPnl,
        }
      : null,
    positions: positions.map((p) => ({
      compassAssetId: p.compassAssetId,
      externalTicker: p.externalTicker,
      externalName: p.externalName,
      currencyCode: p.currencyCode,
      quantity: p.quantity,
      averagePrice: p.averagePrice,
      currentPrice: p.currentPrice,
      unrealizedPnl: p.unrealizedPnl,
    })),
  };
}

// Activity (orders/dividends/transactions) moved to its own repository —
// see trading212-activity-repository.ts — once Phase 4 grew it into a
// paginated, filterable, order/execution-aware feed distinct enough from
// this file's account/position concern to warrant separation.
