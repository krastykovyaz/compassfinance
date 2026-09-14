import "server-only";
import { prisma } from "@/server/db/prisma";
import { acquireSyncLock } from "@/server/brokerage/sync-lock";
import {
  getDecryptedInteractiveBrokersCredentials,
  setInteractiveBrokersSelectedAccount,
} from "@/server/repositories/interactive-brokers-repository";
import {
  buildInteractiveBrokersAuthenticatedCredentials,
  fetchInteractiveBrokersAccountLedger,
  fetchInteractiveBrokersLiveSessionToken,
  fetchInteractiveBrokersPortfolioAccounts,
  fetchInteractiveBrokersPositions,
  fetchInteractiveBrokersTransactions,
  type InteractiveBrokersFetchReason,
  type InteractiveBrokersPortfolioAccount,
} from "./interactive-brokers-client";
import { getInteractiveBrokersConfig } from "./interactive-brokers-config";
import { selectInteractiveBrokersAccount } from "./interactive-brokers-account-selection";
import { mapInteractiveBrokersPositionToAssetId } from "./interactive-brokers-asset-mapping";
import { buildInteractiveBrokersTransactionExternalId, isInteractiveBrokersTradeType } from "./interactive-brokers-activity";
import {
  classifyInteractiveBrokersFetchReason,
  classifyThrownError,
  isCredentialInvalidatingCategory,
  type InteractiveBrokersErrorCategory,
} from "./interactive-brokers-error-classification";
import { getInteractiveBrokersActivityCooldownMs, getInteractiveBrokersStaleLockMs } from "./interactive-brokers-sync-config";

// Phase 2 — the initial read-only portfolio sync engine:
//   authenticate (Live Session Token) → discover accounts → select one →
//   fetch account ledger → fetch positions → normalize → persist.
//
// Follows trading212-sync.ts's established shape as closely as IBKR's
// genuinely different protocol allows (same lock via the now-shared
// acquireSyncLock, same success/failure/sync-metadata semantics, same
// per-step result reporting) — see this file's own inline comments for
// the one structural difference that matters: Trading 212's account/
// positions/orders/dividends/transactions steps are each independently
// callable with the same flat API key, so one failing doesn't block the
// others. IBKR's LST + account discovery are a shared PREREQUISITE for
// every /portfolio/* call that follows — there is no such thing as an
// independent "positions succeeded even though discovery failed" outcome,
// so a prerequisite failure fails both remaining steps identically rather
// than attempting them.

const PROVIDER = "INTERACTIVE_BROKERS";

const MULTIPLE_ACCOUNTS_MESSAGE = "Multiple Interactive Brokers accounts were found — choose which one to sync.";
const NO_ACCOUNTS_MESSAGE = "Interactive Brokers reported no accounts for this connection";

class SyncStepError extends Error {
  readonly category: InteractiveBrokersErrorCategory;
  constructor(message: string, category: InteractiveBrokersErrorCategory) {
    super(message);
    this.category = category;
  }
}

export type InteractiveBrokersSyncStepResult =
  | { status: "success"; count: number }
  | { status: "failed"; message: string; category: InteractiveBrokersErrorCategory };

export type InteractiveBrokersSyncStepName = "account" | "positions";

// Phase 3 — the activity step is deliberately a THIRD, separate result
// type from the two above rather than reusing InteractiveBrokersSyncStepResult:
// it has a real "skipped" outcome (see each reason's own doc note) that
// is neither success nor failure, and — unlike account/positions — its
// outcome never affects the overall sync's synced/failed status (see
// syncInteractiveBrokers's own comment on why): the one viable activity
// source is rate-limited by IBKR itself to 1 request/15min, so "not
// attempted this run" is an expected, routine outcome, not a degraded
// sync.
export type InteractiveBrokersActivityStepResult =
  | { status: "success"; count: number }
  | { status: "failed"; message: string; category: InteractiveBrokersErrorCategory }
  | {
      status: "skipped";
      reason:
        // IBKR's own 1-req/15-min /pa/transactions limit hasn't elapsed
        // since the last real attempt (success or failure) — see
        // BrokerageConnection.lastActivitySyncAt's own schema comment.
        | "cooldown"
        // The account currently holds no positions at all — /pa/
        // transactions is conid-scoped, so there is nothing to fetch
        // activity FOR yet.
        | "no_positions"
        // account/positions themselves failed before the activity step
        // was ever reached — never a real attempt, so the cooldown clock
        // is left untouched.
        | "not_attempted";
    };

export type InteractiveBrokersSyncResult =
  | {
      status: "synced" | "failed";
      startedAt: string;
      completedAt: string;
      durationMs: number;
      account: InteractiveBrokersSyncStepResult;
      positions: InteractiveBrokersSyncStepResult;
      activity: InteractiveBrokersActivityStepResult;
      message?: string;
    }
  | { status: "not_connected" }
  /** Another sync (a duplicate click, or a request that's still in
   * flight) is already running for this exact connection. */
  | { status: "already_syncing" }
  /** Milestone 21 — discovery found more than one usable account and
   * there's no still-valid prior selection (see
   * interactive-brokers-account-selection.ts). No account/positions data
   * was touched; the caller (the manual sync route → the UI) must let
   * the user choose one via POST /api/user/interactive-brokers/select-
   * account, then sync again. */
  | { status: "needs_account_selection"; accounts: InteractiveBrokersPortfolioAccount[] };

function sanitizedInternalMessage(): string {
  return "Interactive Brokers sync failed unexpectedly — try again shortly";
}

function toStepFailure(err: unknown): { status: "failed"; message: string; category: InteractiveBrokersErrorCategory } {
  if (err instanceof SyncStepError) {
    return { status: "failed", message: err.message, category: err.category };
  }
  return { status: "failed", message: sanitizedInternalMessage(), category: classifyThrownError() };
}

/** Only invested-value is ever derived rather than read directly:
 * IBKR's ledger reports market value broken down PER asset class
 * (stockmarketvalue, futuremarketvalue, ...) with no single "invested
 * value" field of its own — unlike Trading 212, which reports one
 * directly. Summing only the asset-class fields this integration knows
 * about would UNDERSTATE the true figure for any class it doesn't
 * enumerate (bonds, funds, warrants, ...) — a real correctness risk, not
 * just a style choice. `netLiquidationValue - cashBalance` is a genuine
 * accounting identity (total portfolio value minus cash IS everything
 * else, by definition) computed from two real numbers IBKR did report —
 * the same "mechanically derive from two real numbers, never guess"
 * discipline trading212-client.ts already uses for its own fillPrice. */
function deriveInvestedValue(netLiquidationValue: number | null, cashBalance: number | null): number | null {
  if (netLiquidationValue === null || cashBalance === null) return null;
  return netLiquidationValue - cashBalance;
}

function toSharedPrerequisiteFailure(
  reason: InteractiveBrokersFetchReason,
  message: string
): { account: InteractiveBrokersSyncStepResult; positions: InteractiveBrokersSyncStepResult } {
  const failure: InteractiveBrokersSyncStepResult = { status: "failed", message, category: classifyInteractiveBrokersFetchReason(reason) };
  return { account: failure, positions: failure };
}

async function finalizeFailure(
  connectionId: string,
  startedAt: Date,
  steps: { account: InteractiveBrokersSyncStepResult; positions: InteractiveBrokersSyncStepResult },
  activity: InteractiveBrokersActivityStepResult = { status: "skipped", reason: "not_attempted" }
): Promise<InteractiveBrokersSyncResult> {
  const completedAt = new Date();
  const needsAttention = [steps.account, steps.positions].some(
    (s) => s.status === "failed" && isCredentialInvalidatingCategory(s.category)
  );
  const message = [steps.account, steps.positions]
    .map((s) => (s.status === "failed" ? s.message : ""))
    .filter(Boolean)
    .join("; ");

  await prisma.brokerageConnection.update({
    where: { id: connectionId },
    data: {
      syncStatus: "FAILED",
      syncError: message,
      lastFailedSyncAt: completedAt,
      ...(needsAttention ? { status: "ERROR" } : {}),
    },
  });

  return {
    status: "failed",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    message,
    ...steps,
    activity,
  };
}

/** Runs one full Phase 2 sync pass for `userId`'s Interactive Brokers
 * connection. Never claims success before every write below has actually
 * committed — `synced`/`lastSyncAt` are only ever set in the one branch
 * where both the account and positions steps succeeded. A failure never
 * deletes previously-synced BrokerageAccount/BrokeragePosition rows —
 * the positions step's own delete only ever removes positions IBKR no
 * longer reports (see the schema's own "current-state, not history"
 * note), never all of them because of an unrelated error earlier in the
 * same run. */
type AuthCredentials = ReturnType<typeof buildInteractiveBrokersAuthenticatedCredentials>;

export type InteractiveBrokersDiscoveryResult =
  | { ok: true; accounts: InteractiveBrokersPortfolioAccount[]; authCredentials: AuthCredentials }
  | { ok: false; reason: InteractiveBrokersFetchReason; message: string };

/** Authenticates (derives a fresh Live Session Token) and discovers
 * accounts — the shared prerequisite both syncInteractiveBrokers and the
 * account-selection API route need (the route re-validates a user's
 * choice against a FRESH discovery call before persisting it, rather
 * than trusting a client-supplied account id outright). Extracted here
 * so there is exactly one implementation of "authenticate + discover,"
 * not two. A user with no stored credentials at all is reported via the
 * existing `not_configured` reason — not a credential rejection, not a
 * transient failure, just "nothing to discover" (classifyInteractive
 * BrokersFetchReason already buckets it as INTERNAL for exactly this
 * reason). */
export async function discoverInteractiveBrokersAccounts(userId: string): Promise<InteractiveBrokersDiscoveryResult> {
  const credentials = await getDecryptedInteractiveBrokersCredentials(userId);
  if (!credentials) {
    return { ok: false, reason: "not_configured", message: "Interactive Brokers is not connected" };
  }
  const config = getInteractiveBrokersConfig();
  if (!config) {
    return { ok: false, reason: "not_configured", message: "Interactive Brokers portfolio sync is not configured" };
  }

  const lstResult = await fetchInteractiveBrokersLiveSessionToken(credentials.accessToken, credentials.accessTokenSecret);
  if (!lstResult.ok) return lstResult;

  const authCredentials = buildInteractiveBrokersAuthenticatedCredentials(
    config.consumerKey,
    credentials.accessToken,
    lstResult.data.liveSessionToken
  );

  const accountsResult = await fetchInteractiveBrokersPortfolioAccounts(authCredentials);
  if (!accountsResult.ok) return accountsResult;

  return { ok: true, accounts: accountsResult.data, authCredentials };
}

export async function syncInteractiveBrokers(userId: string): Promise<InteractiveBrokersSyncResult> {
  const startedAt = new Date();
  const credentials = await getDecryptedInteractiveBrokersCredentials(userId);
  const connection = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!credentials || !connection) return { status: "not_connected" };

  if (!(await acquireSyncLock(connection.id, getInteractiveBrokersStaleLockMs()))) {
    return { status: "already_syncing" };
  }

  const discovery = await discoverInteractiveBrokersAccounts(userId);
  if (!discovery.ok) {
    return finalizeFailure(connection.id, startedAt, toSharedPrerequisiteFailure(discovery.reason, discovery.message));
  }
  const { accounts, authCredentials } = discovery;

  const selection = selectInteractiveBrokersAccount(accounts, connection.externalAccountId);
  if (selection.kind === "no_accounts") {
    return finalizeFailure(connection.id, startedAt, {
      account: { status: "failed", message: NO_ACCOUNTS_MESSAGE, category: "INVALID_RESPONSE" },
      positions: { status: "failed", message: NO_ACCOUNTS_MESSAGE, category: "INVALID_RESPONSE" },
    });
  }
  if (selection.kind === "needs_selection") {
    const completedAt = new Date();
    // Not a credential problem — `status` (CONNECTED) is left untouched,
    // only the sync outcome itself is recorded as needing the user's
    // input, using the existing FAILED/syncError fields rather than a
    // new state (Milestone: "reuse the existing BrokerageConnection
    // status model only").
    await prisma.brokerageConnection.update({
      where: { id: connection.id },
      data: { syncStatus: "FAILED", syncError: MULTIPLE_ACCOUNTS_MESSAGE, lastFailedSyncAt: completedAt },
    });
    return { status: "needs_account_selection", accounts: selection.accounts };
  }

  if (selection.accountId !== connection.externalAccountId) {
    await setInteractiveBrokersSelectedAccount(userId, selection.accountId);
  }

  const account = await runAccountStep(userId, connection.id, selection.accountId, authCredentials);
  const positions = await runPositionsStep(userId, connection.id, selection.accountId, authCredentials);
  const steps = { account, positions };

  if (account.status !== "success" || positions.status !== "success") {
    // The activity step is never attempted when the prerequisites
    // themselves failed — there'd be nothing meaningful to fetch
    // activity FOR, and IBKR's own 15-minute rate limit is too precious
    // to spend on a run that's already failing for an unrelated reason.
    return finalizeFailure(connection.id, startedAt, steps);
  }

  const activity = await runActivityStep(userId, connection.id, selection.accountId, authCredentials, connection.lastActivitySyncAt);
  const completedAt = new Date();

  // The activity step's own outcome NEVER affects `syncStatus`/`status`
  // here — see InteractiveBrokersActivityStepResult's own doc comment:
  // IBKR's 1-req/15-min rate limit on the one viable activity endpoint
  // makes "skipped this run" the ROUTINE case, not a degraded sync, and
  // account+positions succeeding is already a fully successful sync in
  // the Phase 2 sense. lastActivitySyncAt is updated only when a REAL
  // attempt was made (success or failure) — never on a skip, since no
  // request was actually sent to IBKR that would need a cooldown.
  await prisma.brokerageConnection.update({
    where: { id: connection.id },
    data: {
      syncStatus: "SYNCED",
      syncError: null,
      lastSyncAt: completedAt,
      status: "CONNECTED",
      ...(activity.status !== "skipped" ? { lastActivitySyncAt: completedAt } : {}),
    },
  });
  return {
    status: "synced",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    ...steps,
    activity,
  };
}

async function runAccountStep(
  userId: string,
  connectionId: string,
  accountId: string,
  credentials: AuthCredentials
): Promise<InteractiveBrokersSyncStepResult> {
  try {
    const result = await fetchInteractiveBrokersAccountLedger(accountId, credentials);
    if (!result.ok) throw new SyncStepError(result.message, classifyInteractiveBrokersFetchReason(result.reason));

    const investedValue = deriveInvestedValue(result.data.netLiquidationValue, result.data.cashBalance);
    const fields = {
      currencyCode: result.data.currencyCode,
      totalValue: result.data.netLiquidationValue,
      cashAvailable: result.data.cashBalance,
      // No IBKR equivalent for Trading 212's "cash reserved for pending
      // orders" — Phase 2 doesn't sync orders at all, so this stays null
      // for every IBKR account row, always.
      cashInPies: null,
      cashReserved: null,
      investedValue,
      realizedPnl: result.data.realizedPnl,
      unrealizedPnl: result.data.unrealizedPnl,
    };
    await prisma.brokerageAccount.upsert({
      where: { brokerageConnectionId: connectionId },
      create: { userId, brokerageConnectionId: connectionId, provider: PROVIDER, ...fields },
      update: fields,
    });
    return { status: "success", count: 1 };
  } catch (err) {
    return toStepFailure(err);
  }
}

async function runPositionsStep(
  userId: string,
  connectionId: string,
  accountId: string,
  credentials: AuthCredentials
): Promise<InteractiveBrokersSyncStepResult> {
  try {
    const result = await fetchInteractiveBrokersPositions(accountId, credentials);
    if (!result.ok) throw new SyncStepError(result.message, classifyInteractiveBrokersFetchReason(result.reason));

    const externalIds = result.data.map((p) => p.conid);
    await prisma.$transaction([
      prisma.brokeragePosition.deleteMany({
        where: { brokerageConnectionId: connectionId, externalId: { notIn: externalIds } },
      }),
      ...result.data.map((p) => {
        const compassAssetId = mapInteractiveBrokersPositionToAssetId({
          conid: p.conid,
          symbol: p.symbol,
          assetClass: p.assetClass,
          currency: p.currency,
        });
        const fields = {
          compassAssetId,
          externalTicker: p.symbol ?? p.conid,
          externalName: null as string | null,
          currencyCode: p.currency,
          quantity: p.quantity,
          averagePrice: p.averagePrice,
          currentPrice: p.marketPrice,
          unrealizedPnl: p.unrealizedPnl,
          realizedPnl: p.realizedPnl,
          assetClass: p.assetClass,
          sector: p.sector,
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
    return { status: "success", count: result.data.length };
  } catch (err) {
    return toStepFailure(err);
  }
}

/** Phase 3 — POST /pa/transactions, for exactly ONE currently-held
 * position per sync run (IBKR's own rate limit — 1 request/15 minutes
 * GLOBALLY, see interactive-brokers-sync-config.ts — makes covering
 * every position in one run infeasible; over many manual syncs, 15+
 * minutes apart, each held position eventually gets its own window of
 * activity history). The target position is the one whose stringified
 * conid sorts first — a deterministic, documented choice, not a random
 * or "most recent" pick, so which position gets covered on a given run
 * is always predictable rather than surprising. A real, documented
 * limitation: this does NOT rotate across positions, so a portfolio with
 * several holdings will only ever see this one position's activity
 * synced until it's sold — see the Phase 3 doc addendum for why a
 * rotation scheme was deliberately not built (added complexity not
 * clearly justified given the endpoint's own severe rate limit already
 * makes "full history" unreachable regardless).
 *
 * Every "Buy"/"Sell" row is stored in BrokerageOrder (already fully
 * filled — see interactive-brokers-activity.ts's isInteractiveBrokersTradeType);
 * every other row is stored in BrokerageActivity with IBKR's raw `type`
 * preserved verbatim (see normalizeInteractiveBrokersActivityRow, the
 * read-side counterpart). Idempotent via
 * buildInteractiveBrokersTransactionExternalId — running this step twice
 * against identical IBKR data upserts the same rows, never duplicates. */
async function runActivityStep(
  userId: string,
  connectionId: string,
  accountId: string,
  credentials: AuthCredentials,
  lastActivitySyncAt: Date | null
): Promise<InteractiveBrokersActivityStepResult> {
  if (lastActivitySyncAt && Date.now() - lastActivitySyncAt.getTime() < getInteractiveBrokersActivityCooldownMs()) {
    return { status: "skipped", reason: "cooldown" };
  }

  const candidatePositions = await prisma.brokeragePosition.findMany({
    where: { userId, brokerageConnectionId: connectionId, provider: PROVIDER },
    orderBy: { externalId: "asc" },
    take: 1,
  });
  if (candidatePositions.length === 0) {
    return { status: "skipped", reason: "no_positions" };
  }
  const position = candidatePositions[0];
  const conid = Number(position.externalId);
  if (!Number.isFinite(conid)) {
    // Defensive only — every IBKR-provider BrokeragePosition row's
    // externalId is always a stringified conid (see runPositionsStep
    // above), so this should be unreachable in practice.
    return { status: "skipped", reason: "no_positions" };
  }

  try {
    const result = await fetchInteractiveBrokersTransactions(accountId, conid, credentials);
    if (!result.ok) throw new SyncStepError(result.message, classifyInteractiveBrokersFetchReason(result.reason));

    let count = 0;
    for (const item of result.data) {
      const externalId = buildInteractiveBrokersTransactionExternalId(item);

      if (isInteractiveBrokersTradeType(item.type)) {
        const side: "BUY" | "SELL" = item.quantity < 0 ? "SELL" : "BUY";
        const magnitude = Math.abs(item.quantity);
        const fields = {
          compassAssetId: position.compassAssetId,
          externalTicker: position.externalTicker,
          externalName: item.description,
          side,
          // /pa/transactions only ever reports COMPLETED transactions —
          // there is no partial/pending/cancelled state reachable from
          // this endpoint, so every row is a real, confirmed fill.
          status: "FILLED",
          quantity: magnitude,
          filledQuantity: magnitude,
          fillPrice: item.price,
          filledValue: item.amount,
          currencyCode: item.currencyCode,
          externalCreatedAt: new Date(item.occurredAt),
        };
        await prisma.brokerageOrder.upsert({
          where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId } },
          create: { userId, brokerageConnectionId: connectionId, provider: PROVIDER, externalId, ...fields },
          update: fields,
        });
      } else {
        const fields = {
          type: item.type, // IBKR's own raw type string, preserved verbatim — never guessed at
          compassAssetId: position.compassAssetId,
          externalTicker: position.externalTicker,
          externalName: item.description,
          quantity: item.quantity !== 0 ? Math.abs(item.quantity) : null,
          amount: item.amount,
          currencyCode: item.currencyCode,
          externalCreatedAt: new Date(item.occurredAt),
        };
        await prisma.brokerageActivity.upsert({
          where: { brokerageConnectionId_externalId: { brokerageConnectionId: connectionId, externalId } },
          create: { userId, brokerageConnectionId: connectionId, provider: PROVIDER, externalId, ...fields },
          update: fields,
        });
      }
      count++;
    }
    return { status: "success", count };
  } catch (err) {
    return toStepFailure(err);
  }
}
