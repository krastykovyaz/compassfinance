import "server-only";
import { prisma } from "@/server/db/prisma";
import { syncTrading212, type Trading212SyncResult } from "./trading212-sync";
import { getTrading212SyncIntervalMs, getTrading212MaxConcurrentSyncs } from "./trading212-sync-config";

const PROVIDER = "trading212";

export type Trading212SchedulerCycleResult = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  eligible: number;
  synced: number;
  failed: number;
  alreadySyncing: number;
};

/** Requirement 3: which connections the scheduler will even attempt this
 * cycle.
 *  - provider = trading212 (this scheduler only ever touches its own
 *    provider's rows — a future IBKR/Robinhood scheduler would be its own
 *    query, not a shared one).
 *  - status != "ERROR": a connection Requirement 12 has already flagged
 *    as needing the user's attention (an AUTHENTICATION failure) is
 *    excluded — retrying rejected credentials every cycle forever would
 *    be exactly the "retry every 15 minutes forever" Requirement 11
 *    warns against. A user fixing this (reconnecting) resets `status`
 *    back to CONNECTED via connectTrading212, making the row eligible
 *    again automatically.
 *  - syncStartedAt is null, or older than the configured interval: this
 *    ONE field (set at the start of every attempt, success or failure —
 *    see trading212-sync.ts's acquireSyncLock) throttles both "don't
 *    re-sync something that just succeeded" AND "don't hammer retries on
 *    something that just failed" with a single condition, and doubles as
 *    the lock's own timestamp so a stuck SYNCING row still shows up here
 *    once it's stale (acquireSyncLock recovers it; this query is just
 *    the cheap pre-filter, not the safety guarantee itself). */
async function findEligibleConnections(): Promise<{ id: string; userId: string }[]> {
  const cutoff = new Date(Date.now() - getTrading212SyncIntervalMs());
  return prisma.brokerageConnection.findMany({
    where: {
      provider: PROVIDER,
      status: { not: "ERROR" },
      OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: cutoff } }],
    },
    select: { id: true, userId: true },
  });
}

/** Requirement 10: bounded concurrency, hand-rolled rather than an
 * unbounded Promise.all over every eligible connection — a fleet of
 * users all due at once must not turn into a request storm against
 * Trading 212. Each worker pulls the next item off the shared queue as
 * soon as it finishes its current one, so slow connections don't leave
 * fast ones waiting behind them. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** The one automatic-sync cycle function — called on an interval by
 * instrumentation.ts (Requirement 1's chosen scheduling mechanism, since
 * this deployment is a persistent systemd-managed Next.js server, not a
 * serverless platform with its own cron primitive) and, identically, by
 * POST /api/cron/trading212-sync for manual/ops-triggered runs. Both
 * callers get the exact same eligibility, concurrency, and per-connection
 * sync behavior — there is no second copy of any of this logic
 * (Requirement 5's "same engine" principle applied one level up, to the
 * scheduling itself). */
export async function runTrading212AutoSyncCycle(): Promise<Trading212SchedulerCycleResult> {
  const startedAt = new Date();
  const connections = await findEligibleConnections();
  const concurrency = getTrading212MaxConcurrentSyncs();

  const outcomes = await mapWithConcurrency(connections, concurrency, async (connection) => {
    try {
      return await syncTrading212(connection.userId);
    } catch {
      // syncTrading212 itself catches everything into a "failed" result —
      // this is only a last-resort guard so one connection throwing
      // (e.g. a Prisma connection blip) can't take down the whole cycle
      // for every OTHER connection still queued behind it.
      return { status: "failed" } as Trading212SyncResult;
    }
  });

  const completedAt = new Date();
  const synced = outcomes.filter((o) => o.status === "synced").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const alreadySyncing = outcomes.filter((o) => o.status === "already_syncing").length;

  const result: Trading212SchedulerCycleResult = {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    eligible: connections.length,
    synced,
    failed,
    alreadySyncing,
  };

  // Requirement 17: one summary line per cycle, not one line per
  // connection — a 15-minute cadence with hundreds of connections would
  // otherwise flood the logs for the common, uninteresting case where
  // everything just worked.
  console.log(
    `[trading212-scheduler] eligible=${result.eligible} synced=${result.synced} failed=${result.failed} alreadySyncing=${result.alreadySyncing} durationMs=${result.durationMs}`
  );

  return result;
}
