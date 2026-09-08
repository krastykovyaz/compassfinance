import "server-only";
import { prisma } from "@/server/db/prisma";
import { getDecryptedTrading212Credentials } from "@/server/repositories/trading212-repository";
import { trading212Provider } from "./trading212-provider";
import { mapTrading212TickerToAssetId } from "./trading212-asset-mapping";
import { getTrading212StaleLockMs } from "./trading212-sync-config";
import {
  classifyFetchReason,
  classifyThrownError,
  isCredentialInvalidatingCategory,
  type Trading212ErrorCategory,
} from "./trading212-error-classification";
import type {
  ProviderOrder,
  ProviderDividend,
  ProviderTransaction,
  ProviderPagedResult,
  ProviderFetchResult,
} from "./brokerage-provider";

const PROVIDER = "trading212";

// Order history is rate-limited by Trading 212 itself to 6 calls/minute
// (per their own docs) — capped well under that per sync call. Dividends
// and transactions aren't documented as similarly restricted, but are
// capped too as a general safety margin, not because any source specified
// a limit for them.
const ORDER_HISTORY_MAX_PAGES = 6;
const OTHER_HISTORY_MAX_PAGES = 10;

class SyncStepError extends Error {
  readonly category: Trading212ErrorCategory;
  constructor(message: string, category: Trading212ErrorCategory) {
    super(message);
    this.category = category;
  }
}

export type Trading212SyncStepResult =
  | { status: "success"; count: number }
  | { status: "failed"; message: string; category: Trading212ErrorCategory }
  // Only reachable when an EARLIER step failed with an AUTHENTICATION
  // category — see runSteps below: there is no point spending 4 more
  // requests against credentials Trading 212 has already, explicitly
  // rejected in this same run.
  | { status: "skipped" };

export type Trading212SyncStepName = "account" | "positions" | "orders" | "dividends" | "transactions";

export type Trading212SyncResult =
  | {
      status: "synced" | "failed";
      startedAt: string;
      completedAt: string;
      durationMs: number;
      account: Trading212SyncStepResult;
      positions: Trading212SyncStepResult;
      orders: Trading212SyncStepResult;
      dividends: Trading212SyncStepResult;
      transactions: Trading212SyncStepResult;
      /** Present only when status is "failed" — the same sanitized
       * summary persisted to connection.syncError. */
      message?: string;
    }
  | { status: "not_connected" }
  /** Requirement 4: another sync (manual or scheduled) is already
   * running for this exact connection — this attempt made no changes at
   * all, not even a failed one. */
  | { status: "already_syncing" };

/** Atomic compare-and-swap lock acquire — Requirement 4. The WHERE clause
 * re-validates "not currently locked, or the lock is stale" as part of
 * the SAME atomic UPDATE the database executes, so two callers racing to
 * sync the same connection (cron overlap, manual click during a scheduled
 * run, two app instances) can never both see themselves as the winner:
 * exactly one UPDATE affects the row (count === 1), the other affects
 * none (count === 0). This works correctly regardless of how many
 * processes/instances are calling it, because the guarantee comes from
 * the database's own statement atomicity, not from anything held in this
 * process's memory. A SYNCING row whose syncStartedAt is older than the
 * stale-lock threshold is treated as abandoned (a crashed process) and
 * recoverable — otherwise one hard crash mid-sync would wedge that
 * connection out of automatic sync forever. */
async function acquireSyncLock(connectionId: string): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - getTrading212StaleLockMs());
  const result = await prisma.brokerageConnection.updateMany({
    where: {
      id: connectionId,
      OR: [
        { syncStatus: { not: "SYNCING" } },
        { syncStatus: "SYNCING", syncStartedAt: null },
        { syncStatus: "SYNCING", syncStartedAt: { lt: staleBefore } },
      ],
    },
    data: { syncStatus: "SYNCING", syncStartedAt: now },
  });
  return result.count === 1;
}

function sanitizedInternalMessage(): string {
  // Never the raw caught error — an unexpected exception (a Prisma error,
  // a bug) could in principle stringify something not meant for a user or
  // a log line outside this process's own trusted context. A fixed,
  // generic message is always safe.
  return "Trading 212 sync failed unexpectedly — try again shortly";
}

/** Runs one full sync pass for `userId`'s Trading 212 connection: account
 * summary, positions (replaced wholesale — see schema.prisma's own note on
 * why that's not "deleting history"), and incremental-by-cursor order/
 * dividend/transaction history. This is the ONE sync engine — the manual
 * route (POST /api/user/trading212/sync) and the automatic scheduler
 * (trading212-scheduler.ts) both call this exact function; neither has
 * its own copy of any of the logic below (Requirement 5).
 *
 * Each step runs independently: a failure in one (Requirement 7's worked
 * example — dividends failing) does not prevent the OTHERS from being
 * attempted and committed. The one exception is an AUTHENTICATION
 * failure, which short-circuits the remaining steps as "skipped" — every
 * subsequent call would fail identically against the same rejected
 * credentials, so there's no reason to spend the requests. */
export async function syncTrading212(userId: string): Promise<Trading212SyncResult> {
  const startedAt = new Date();
  const credentials = await getDecryptedTrading212Credentials(userId);
  const connection = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!credentials || !connection) return { status: "not_connected" };

  if (!(await acquireSyncLock(connection.id))) {
    return { status: "already_syncing" };
  }

  const steps = await runSteps(userId, connection.id, credentials);
  const completedAt = new Date();
  const failedSteps = (Object.entries(steps) as [Trading212SyncStepName, Trading212SyncStepResult][]).filter(
    ([, r]) => r.status === "failed"
  );
  const allSucceeded = failedSteps.length === 0;

  if (allSucceeded) {
    await prisma.brokerageConnection.update({
      where: { id: connection.id },
      data: { syncStatus: "SYNCED", syncError: null, lastSyncAt: completedAt, status: "CONNECTED" },
    });
    logSyncOutcome({ connectionId: connection.id, startedAt, completedAt, steps, ok: true });
    return { status: "synced", startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime(), ...steps };
  }

  // Requirement 12: only an AUTHENTICATION/PERMISSION failure means the
  // credentials themselves are the problem — that's the one case where
  // the connection is flagged as needing the user's attention. Every
  // other failure category is transient/environmental and leaves
  // `status` (CONNECTED) untouched, so the scheduler keeps retrying it
  // on the normal cadence.
  const needsAttention = failedSteps.some(([, r]) => r.status === "failed" && isCredentialInvalidatingCategory(r.category));
  const message = summarizeFailures(failedSteps);

  await prisma.brokerageConnection.update({
    where: { id: connection.id },
    data: {
      syncStatus: "FAILED",
      syncError: message,
      lastFailedSyncAt: completedAt,
      ...(needsAttention ? { status: "ERROR" } : {}),
    },
  });
  logSyncOutcome({ connectionId: connection.id, startedAt, completedAt, steps, ok: false });

  return {
    status: "failed",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    message,
    ...steps,
  };
}

function summarizeFailures(failedSteps: [Trading212SyncStepName, Trading212SyncStepResult][]): string {
  // A short, sanitized summary naming which steps failed — each
  // individual step message already comes from either a classified
  // provider result (safe, generic-by-construction — see
  // trading212-client.ts) or sanitizedInternalMessage() above, so nothing
  // here can ever include raw credentials or an unclassified exception's
  // own text.
  return failedSteps
    .map(([name, r]) => (r.status === "failed" ? `${name}: ${r.message}` : ""))
    .filter(Boolean)
    .join("; ");
}

type Credentials = { apiKey: string; apiSecret: string };

async function runSteps(
  userId: string,
  connectionId: string,
  credentials: Credentials
): Promise<Record<Trading212SyncStepName, Trading212SyncStepResult>> {
  const account = await runAccountStep(userId, connectionId, credentials);
  if (account.status === "failed" && isCredentialInvalidatingCategory(account.category)) {
    const skipped = { status: "skipped" as const };
    return { account, positions: skipped, orders: skipped, dividends: skipped, transactions: skipped };
  }

  const positions = await runPositionsStep(userId, connectionId, credentials);
  if (positions.status === "failed" && isCredentialInvalidatingCategory(positions.category)) {
    const skipped = { status: "skipped" as const };
    return { account, positions, orders: skipped, dividends: skipped, transactions: skipped };
  }

  const orders = await runHistoryStep(ORDER_HISTORY_MAX_PAGES, (cursor) => trading212Provider.getOrderHistoryPage(credentials, cursor), (items) =>
    upsertOrders(userId, connectionId, items)
  );
  const dividends = await runHistoryStep(OTHER_HISTORY_MAX_PAGES, (cursor) => trading212Provider.getDividendsPage(credentials, cursor), (items) =>
    upsertDividends(userId, connectionId, items)
  );
  const transactions = await runHistoryStep(OTHER_HISTORY_MAX_PAGES, (cursor) => trading212Provider.getTransactionsPage(credentials, cursor), (items) =>
    upsertTransactions(userId, connectionId, items)
  );

  return { account, positions, orders, dividends, transactions };
}

async function runAccountStep(userId: string, connectionId: string, credentials: Credentials): Promise<Trading212SyncStepResult> {
  try {
    const result = await trading212Provider.getAccountSummary(credentials);
    if (!result.ok) throw new SyncStepError(result.message, classifyFetchReason(result.reason));
    await prisma.brokerageAccount.upsert({
      where: { brokerageConnectionId: connectionId },
      create: { userId, brokerageConnectionId: connectionId, provider: PROVIDER, ...result.data },
      update: { ...result.data },
    });
    return { status: "success", count: 1 };
  } catch (err) {
    return toStepFailure(err);
  }
}

async function runPositionsStep(userId: string, connectionId: string, credentials: Credentials): Promise<Trading212SyncStepResult> {
  try {
    const result = await trading212Provider.getPositions(credentials);
    if (!result.ok) throw new SyncStepError(result.message, classifyFetchReason(result.reason));
    const externalIds = result.data.map((p) => p.externalTicker);
    await prisma.$transaction([
      prisma.brokeragePosition.deleteMany({
        where: { brokerageConnectionId: connectionId, externalId: { notIn: externalIds } },
      }),
      ...result.data.map((p) =>
        prisma.brokeragePosition.upsert({
          where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId: p.externalTicker } },
          create: {
            userId,
            brokerageConnectionId: connectionId,
            provider: PROVIDER,
            externalId: p.externalTicker,
            compassAssetId: mapTrading212TickerToAssetId(p.externalTicker),
            externalTicker: p.externalTicker,
            externalName: p.externalName,
            currencyCode: p.currencyCode,
            quantity: p.quantity,
            averagePrice: p.averagePrice,
            currentPrice: p.currentPrice,
            unrealizedPnl: p.unrealizedPnl,
          },
          update: {
            compassAssetId: mapTrading212TickerToAssetId(p.externalTicker),
            externalName: p.externalName,
            currencyCode: p.currencyCode,
            quantity: p.quantity,
            averagePrice: p.averagePrice,
            currentPrice: p.currentPrice,
            unrealizedPnl: p.unrealizedPnl,
          },
        })
      ),
    ]);
    return { status: "success", count: result.data.length };
  } catch (err) {
    return toStepFailure(err);
  }
}

async function runHistoryStep<T>(
  maxPages: number,
  fetchPage: (cursor?: string) => Promise<ProviderFetchResult<ProviderPagedResult<T>>>,
  upsertPage: (items: T[]) => Promise<{ newCount: number }>
): Promise<Trading212SyncStepResult> {
  try {
    const newCount = await syncPagedRecords(maxPages, fetchPage, upsertPage);
    return { status: "success", count: newCount };
  } catch (err) {
    return toStepFailure(err);
  }
}

function toStepFailure(err: unknown): { status: "failed"; message: string; category: Trading212ErrorCategory } {
  if (err instanceof SyncStepError) {
    return { status: "failed", message: err.message, category: err.category };
  }
  return { status: "failed", message: sanitizedInternalMessage(), category: classifyThrownError() };
}

function logSyncOutcome(params: {
  connectionId: string;
  startedAt: Date;
  completedAt: Date;
  steps: Record<Trading212SyncStepName, Trading212SyncStepResult>;
  ok: boolean;
}): void {
  // Requirement 17: structured, credential-free observability. Never the
  // userId beyond what's already routine elsewhere in this codebase's
  // logging (kept out here entirely — connectionId is enough to
  // correlate without adding a second identifier to every log line), and
  // never a raw provider payload — every message already came through
  // toStepFailure/summarizeFailures, which only ever carry sanitized
  // text.
  const durationMs = params.completedAt.getTime() - params.startedAt.getTime();
  const summary = (Object.entries(params.steps) as [Trading212SyncStepName, Trading212SyncStepResult][])
    .map(([name, r]) => `${name}=${r.status}${r.status === "success" ? `(${r.count})` : ""}`)
    .join(" ");
  console.log(`[trading212-sync] provider=trading212 connection=${params.connectionId} ok=${params.ok} durationMs=${durationMs} ${summary}`);
}

/** Pages through a Trading 212 history endpoint, committing each page's
 * records immediately (see the function-level note above on why). Trading
 * 212's history endpoints are observed to return most-recent-first, so
 * once a full page contains nothing new, everything on any further page
 * has necessarily already been synced in a prior run — this is the
 * "incremental" half of Requirement 8, avoiding a full history re-scan on
 * every sync without needing a server-tracked cursor of our own.
 *
 * This is ALSO the answer to "handle cursor expiration/invalid cursor
 * safely": Trading 212's own pagination cursor is never persisted across
 * sync runs — every run starts fresh from page 1 for each source. There is
 * therefore nothing that can ever "expire" between runs; a run that stops
 * early (because the first page was already fully known) is trivially
 * safe to repeat from scratch next time, and a run that genuinely needs
 * more history simply pages further within this same call, bounded by
 * maxPages. */
async function syncPagedRecords<T>(
  maxPages: number,
  fetchPage: (cursor?: string) => Promise<ProviderFetchResult<ProviderPagedResult<T>>>,
  upsertPage: (items: T[]) => Promise<{ newCount: number }>
): Promise<number> {
  let cursor: string | undefined;
  let totalNew = 0;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor);
    if (!result.ok) throw new SyncStepError(result.message, classifyFetchReason(result.reason));
    const { newCount } = await upsertPage(result.data.items);
    totalNew += newCount;
    if (result.data.items.length > 0 && newCount === 0) break;
    if (!result.data.nextCursor) break;
    cursor = result.data.nextCursor;
  }
  return totalNew;
}

async function upsertOrders(userId: string, connectionId: string, items: ProviderOrder[]): Promise<{ newCount: number }> {
  if (items.length === 0) return { newCount: 0 };
  const existing = await prisma.brokerageOrder.findMany({
    where: { brokerageConnectionId: connectionId, externalId: { in: items.map((i) => i.externalId) } },
    select: { externalId: true },
  });
  const existingIds = new Set(existing.map((r) => r.externalId));

  for (const item of items) {
    const compassAssetId = mapTrading212TickerToAssetId(item.externalTicker);
    await prisma.brokerageOrder.upsert({
      where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId: item.externalId } },
      create: {
        userId,
        brokerageConnectionId: connectionId,
        provider: PROVIDER,
        externalId: item.externalId,
        compassAssetId,
        externalTicker: item.externalTicker,
        externalName: item.externalName,
        side: item.side,
        status: item.status,
        quantity: item.quantity,
        filledQuantity: item.filledQuantity,
        fillPrice: item.fillPrice,
        filledValue: item.filledValue,
        currencyCode: item.currencyCode,
        externalCreatedAt: new Date(item.externalCreatedAt),
      },
      update: {
        compassAssetId,
        externalName: item.externalName,
        side: item.side,
        status: item.status,
        quantity: item.quantity,
        filledQuantity: item.filledQuantity,
        fillPrice: item.fillPrice,
        filledValue: item.filledValue,
        currencyCode: item.currencyCode,
      },
    });
  }
  return { newCount: items.filter((i) => !existingIds.has(i.externalId)).length };
}

async function upsertDividends(userId: string, connectionId: string, items: ProviderDividend[]): Promise<{ newCount: number }> {
  if (items.length === 0) return { newCount: 0 };
  const existing = await prisma.brokerageActivity.findMany({
    where: { brokerageConnectionId: connectionId, externalId: { in: items.map((i) => i.externalId) } },
    select: { externalId: true },
  });
  const existingIds = new Set(existing.map((r) => r.externalId));

  for (const item of items) {
    const compassAssetId = item.externalTicker ? mapTrading212TickerToAssetId(item.externalTicker) : null;
    await prisma.brokerageActivity.upsert({
      where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId: item.externalId } },
      create: {
        userId,
        brokerageConnectionId: connectionId,
        provider: PROVIDER,
        externalId: item.externalId,
        type: "DIVIDEND",
        compassAssetId,
        externalTicker: item.externalTicker,
        externalName: item.externalName,
        quantity: item.quantity,
        amount: item.amount,
        grossAmountPerShare: item.grossAmountPerShare,
        currencyCode: item.currencyCode,
        externalCreatedAt: new Date(item.externalCreatedAt),
      },
      update: {
        compassAssetId,
        externalName: item.externalName,
        quantity: item.quantity,
        amount: item.amount,
        grossAmountPerShare: item.grossAmountPerShare,
        currencyCode: item.currencyCode,
      },
    });
  }
  return { newCount: items.filter((i) => !existingIds.has(i.externalId)).length };
}

async function upsertTransactions(
  userId: string,
  connectionId: string,
  items: ProviderTransaction[]
): Promise<{ newCount: number }> {
  if (items.length === 0) return { newCount: 0 };
  const existing = await prisma.brokerageTransaction.findMany({
    where: { brokerageConnectionId: connectionId, externalId: { in: items.map((i) => i.externalId) } },
    select: { externalId: true },
  });
  const existingIds = new Set(existing.map((r) => r.externalId));

  for (const item of items) {
    await prisma.brokerageTransaction.upsert({
      where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId: item.externalId } },
      create: {
        userId,
        brokerageConnectionId: connectionId,
        provider: PROVIDER,
        externalId: item.externalId,
        type: item.type,
        amount: item.amount,
        currencyCode: item.currencyCode,
        externalCreatedAt: new Date(item.externalCreatedAt),
      },
      update: {
        type: item.type,
        amount: item.amount,
        currencyCode: item.currencyCode,
      },
    });
  }
  return { newCount: items.filter((i) => !existingIds.has(i.externalId)).length };
}
