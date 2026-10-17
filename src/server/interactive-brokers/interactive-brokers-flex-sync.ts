import "server-only";
import { prisma } from "@/server/db/prisma";
import { acquireSyncLock, releaseSyncLockAsFailed } from "@/server/brokerage/sync-lock";
import { getDecryptedInteractiveBrokersFlexCredentials } from "@/server/repositories/interactive-brokers-repository";
import { fetchFlexReport, type FlexCredentials, type FlexFetchReason } from "./interactive-brokers-flex-client";
import { parseFlexReport, type FlexPosition, type FlexReport } from "./interactive-brokers-flex-parser";
import { mapInteractiveBrokersPositionToAssetId } from "./interactive-brokers-asset-mapping";
import { getInteractiveBrokersStaleLockMs } from "./interactive-brokers-sync-config";
import {
  classifyThrownError,
  isCredentialInvalidatingCategory,
  type InteractiveBrokersErrorCategory,
} from "./interactive-brokers-error-classification";
import {
  syncInteractiveBrokers,
  type InteractiveBrokersActivityStepResult,
  type InteractiveBrokersSyncResult,
  type InteractiveBrokersSyncStepResult,
} from "./interactive-brokers-sync";

// The personal-account sync: one Flex report -> the same BrokerageAccount /
// BrokeragePosition / BrokerageOrder / BrokerageActivity rows the OAuth sync
// fills, so the Portfolio page, the activity feed and Compass all read it
// without knowing which way the account was connected.
//
// What a Flex report is, and is not: a statement as of the last business
// day's close, covering the period set in the user's query. It is never
// live. Positions and the account value are therefore a day behind, and a
// sync run twice in one day returns the same figures.

const PROVIDER = "INTERACTIVE_BROKERS";
const WRITE_CHUNK_SIZE = 200;

function categoryForReason(reason: FlexFetchReason): InteractiveBrokersErrorCategory {
  switch (reason) {
    case "invalid_token":
    case "token_expired":
    case "ip_restricted":
    case "invalid_query":
      return "AUTHENTICATION"; // the user has to fix the credentials: flags the connection
    case "rate_limited":
      return "RATE_LIMIT";
    case "network_error":
      return "NETWORK";
    case "malformed_response":
    case "too_large":
      return "INVALID_RESPONSE";
    default:
      return "PROVIDER_ERROR";
  }
}

function stepFailure(err: unknown): { status: "failed"; message: string; category: InteractiveBrokersErrorCategory } {
  void err; // never forwarded: a raw error could carry database detail
  return { status: "failed", message: "Interactive Brokers sync failed unexpectedly. Try again shortly.", category: classifyThrownError() };
}

/** Total unrealized P/L in the account's base currency. Each position's own
 * figure is in its trading currency, so it is converted with the rate the
 * report supplies; if a rate is missing for a foreign position the total is
 * unknown rather than a sum of mixed currencies. */
export function sumUnrealizedInBase(positions: FlexPosition[], baseCurrency: string | null): number | null {
  if (positions.length === 0) return null;
  let total = 0;
  for (const p of positions) {
    if (p.unrealizedPnl === null) return null;
    const rate = p.fxRateToBase ?? (p.currency !== null && p.currency === baseCurrency ? 1 : null);
    if (rate === null) return null;
    total += p.unrealizedPnl * rate;
  }
  return total;
}

async function inChunks<T>(items: T[], run: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += WRITE_CHUNK_SIZE) {
    await run(items.slice(i, i + WRITE_CHUNK_SIZE));
  }
}

async function writeAccount(userId: string, connectionId: string, report: FlexReport): Promise<InteractiveBrokersSyncStepResult> {
  try {
    const investedValue = report.totalValue !== null && report.cash !== null ? report.totalValue - report.cash : null;
    const fields = {
      currencyCode: report.accountCurrency,
      totalValue: report.totalValue,
      cashAvailable: report.cash,
      cashInPies: null,
      cashReserved: null,
      investedValue,
      realizedPnl: null,
      unrealizedPnl: sumUnrealizedInBase(report.positions, report.accountCurrency),
    };
    await prisma.brokerageAccount.upsert({
      where: { brokerageConnectionId: connectionId },
      create: { userId, brokerageConnectionId: connectionId, provider: PROVIDER, ...fields },
      update: fields,
    });
    return { status: "success", count: 1 };
  } catch (err) {
    return stepFailure(err);
  }
}

async function writePositions(userId: string, connectionId: string, report: FlexReport): Promise<InteractiveBrokersSyncStepResult> {
  try {
    const externalIds = report.positions.map((p) => p.conid);
    await prisma.$transaction([
      prisma.brokeragePosition.deleteMany({ where: { brokerageConnectionId: connectionId, externalId: { notIn: externalIds } } }),
      ...report.positions.map((p) => {
        const fields = {
          compassAssetId: mapInteractiveBrokersPositionToAssetId({ conid: p.conid, symbol: p.symbol, assetClass: p.assetClass, currency: p.currency }),
          externalTicker: p.symbol ?? p.conid,
          externalName: p.description,
          currencyCode: p.currency,
          quantity: p.quantity,
          averagePrice: p.costBasisPrice,
          currentPrice: p.markPrice,
          unrealizedPnl: p.unrealizedPnl,
          realizedPnl: null,
          assetClass: p.assetClass,
          sector: null,
          expiry: p.expiry,
          strike: p.strike,
          multiplier: p.multiplier,
          underlyingConid: p.underlyingConid,
        };
        return prisma.brokeragePosition.upsert({
          where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId: p.conid } },
          create: { userId, brokerageConnectionId: connectionId, provider: PROVIDER, externalId: p.conid, ...fields },
          update: fields,
        });
      }),
    ]);
    return { status: "success", count: report.positions.length };
  } catch (err) {
    return stepFailure(err);
  }
}

async function writeActivity(userId: string, connectionId: string, report: FlexReport): Promise<InteractiveBrokersActivityStepResult> {
  try {
    const orderWrites = report.trades.map((t) => {
      const fields = {
        compassAssetId: mapInteractiveBrokersPositionToAssetId({ conid: t.conid ?? "", symbol: t.symbol, assetClass: t.assetClass, currency: t.currency }),
        externalTicker: t.symbol ?? t.conid ?? "UNKNOWN",
        externalName: t.description,
        side: t.side,
        // A Flex report only contains completed executions.
        status: "FILLED",
        quantity: t.quantity,
        filledQuantity: t.quantity,
        fillPrice: t.price,
        // Gross notional as an unsigned magnitude, matching Trading 212.
        filledValue: t.value !== null ? Math.abs(t.value) : t.price !== null ? Math.abs(t.price * t.quantity) : null,
        currencyCode: t.currency,
        externalCreatedAt: t.occurredAt,
      };
      return prisma.brokerageOrder.upsert({
        where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId: t.externalId } },
        create: { userId, brokerageConnectionId: connectionId, provider: PROVIDER, externalId: t.externalId, ...fields },
        update: fields,
      });
    });

    const activityRows = [
      ...report.cashTransactions.map((c) => ({
        externalId: c.externalId,
        type: c.type, // IBKR's own wording, kept verbatim ("Dividends", "Deposits/Withdrawals", "Other Fees", ...)
        conid: c.conid,
        symbol: c.symbol,
        description: c.description,
        assetClass: c.assetClass,
        currency: c.currency,
        quantity: null as number | null,
        amount: c.amount,
        occurredAt: c.occurredAt,
      })),
      ...report.transfers.map((x) => ({
        externalId: x.externalId,
        type: `Transfer (${x.type})`,
        conid: x.conid,
        symbol: x.symbol,
        description: x.description,
        assetClass: x.assetClass,
        currency: x.currency,
        quantity: x.quantity,
        amount: x.amount,
        occurredAt: x.occurredAt,
      })),
    ];
    const activityWrites = activityRows.map((a) => {
      const fields = {
        type: a.type,
        compassAssetId: a.conid ? mapInteractiveBrokersPositionToAssetId({ conid: a.conid, symbol: a.symbol, assetClass: a.assetClass, currency: a.currency }) : null,
        externalTicker: a.symbol,
        externalName: a.description,
        quantity: a.quantity,
        amount: a.amount,
        currencyCode: a.currency,
        externalCreatedAt: a.occurredAt,
      };
      return prisma.brokerageActivity.upsert({
        where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId: a.externalId } },
        create: { userId, brokerageConnectionId: connectionId, provider: PROVIDER, externalId: a.externalId, ...fields },
        update: fields,
      });
    });

    await inChunks(orderWrites, (chunk) => prisma.$transaction(chunk));
    await inChunks(activityWrites, (chunk) => prisma.$transaction(chunk));
    return { status: "success", count: orderWrites.length + activityWrites.length };
  } catch (err) {
    return stepFailure(err);
  }
}

async function failedResult(
  connectionId: string,
  startedAt: Date,
  failure: { status: "failed"; message: string; category: InteractiveBrokersErrorCategory },
  options?: { bestEffort?: boolean }
): Promise<InteractiveBrokersSyncResult> {
  const completedAt = new Date();
  await releaseSyncLockAsFailed(
    connectionId,
    { syncError: failure.message, lastFailedSyncAt: completedAt, needsAttention: isCredentialInvalidatingCategory(failure.category) },
    options
  );
  return {
    status: "failed",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    message: failure.message,
    account: failure,
    positions: failure,
    activity: { status: "skipped", reason: "not_attempted" },
  };
}

export async function syncInteractiveBrokersFlex(userId: string, credentials: FlexCredentials): Promise<InteractiveBrokersSyncResult> {
  const startedAt = new Date();
  const connection = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!connection) return { status: "not_connected" };

  if (!(await acquireSyncLock(connection.id, getInteractiveBrokersStaleLockMs()))) {
    return { status: "already_syncing" };
  }

  // Everything from here on holds the lock; any unexpected throw must
  // release it (see the same reasoning in interactive-brokers-sync.ts).
  try {
    const fetched = await fetchFlexReport(credentials);
    if (!fetched.ok) {
      return await failedResult(connection.id, startedAt, { status: "failed", message: fetched.message, category: categoryForReason(fetched.reason) });
    }

    const parsed = parseFlexReport(fetched.data);
    if (!parsed.ok) {
      return await failedResult(connection.id, startedAt, { status: "failed", message: parsed.message, category: "INVALID_RESPONSE" });
    }
    const report = parsed.report;

    // writePositions replaces the stored positions with the report's. A
    // report whose query lacks the Open Positions section has an empty list
    // for a different reason, and syncing it would delete every position
    // the user holds while reporting success. Refuse instead and say why.
    if (!report.hasOpenPositionsSection) {
      return await failedResult(connection.id, startedAt, {
        status: "failed",
        message:
          "The Flex Query has no Open Positions section, so the report cannot say what the account holds. Edit the query in Interactive Brokers, add Open Positions, and sync again. Nothing was changed.",
        category: "INVALID_RESPONSE",
      });
    }

    const account = await writeAccount(userId, connection.id, report);
    const positions = await writePositions(userId, connection.id, report);
    if (account.status !== "success" || positions.status !== "success") {
      const failure = account.status === "failed" ? account : (positions as Extract<InteractiveBrokersSyncStepResult, { status: "failed" }>);
      return await failedResult(connection.id, startedAt, failure);
    }
    const activity = await writeActivity(userId, connection.id, report);

    const completedAt = new Date();
    await prisma.brokerageConnection.update({
      where: { id: connection.id },
      data: {
        syncStatus: "SYNCED",
        syncError: null,
        lastSyncAt: completedAt,
        status: "CONNECTED",
        externalAccountId: report.accountId ?? connection.externalAccountId,
      },
    });
    return {
      status: "synced",
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      account,
      positions,
      activity,
    };
  } catch (err) {
    console.error("[interactive-brokers-flex-sync] unexpected error mid-sync:", err instanceof Error ? err.message.slice(0, 300) : "unknown");
    return await failedResult(
      connection.id,
      startedAt,
      { status: "failed", message: "An unexpected error occurred while syncing.", category: "INTERNAL" },
      { bestEffort: true }
    );
  }
}

/** The one entry point the sync route calls: a Flex connection syncs from
 * its report, anything else takes the OAuth path. */
export async function syncInteractiveBrokersForUser(userId: string): Promise<InteractiveBrokersSyncResult> {
  const flex = await getDecryptedInteractiveBrokersFlexCredentials(userId);
  if (flex) return syncInteractiveBrokersFlex(userId, flex);
  return syncInteractiveBrokers(userId);
}
