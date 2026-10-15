import "server-only";
import { prisma } from "@/server/db/prisma";

// Provider-neutral atomic compare-and-swap sync lock — extracted from
// trading212-sync.ts (its original, still-sole home until Interactive
// Brokers' own sync engine needed the exact same primitive in Phase 2)
// specifically so a second provider's sync engine reuses this one
// implementation rather than a second copy of the same locking logic
// (Milestone instruction: "do not create a second generic
// synchronization architecture"). Behavior is unchanged from the
// original — see the extensive comment history in trading212-sync.test.ts
// for the reasoning already established there.
//
// The WHERE clause re-validates "not currently locked, or the lock is
// stale" as part of the SAME atomic UPDATE the database executes, so two
// callers racing to sync the same connection (cron overlap, manual click
// during a scheduled run, two app instances) can never both see
// themselves as the winner: exactly one UPDATE affects the row (count
// === 1), the other affects none (count === 0). A SYNCING row whose
// syncStartedAt is older than `staleLockMs` is treated as abandoned (a
// crashed process) and recoverable — otherwise one hard crash mid-sync
// would wedge that connection out of automatic sync forever.
export async function acquireSyncLock(connectionId: string, staleLockMs: number): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleLockMs);
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

// Records a sync as FAILED and releases the lock. One implementation shared
// by trading212-sync.ts and interactive-brokers-sync.ts (each used to carry
// its own copy).
//
// updateMany, not update, on purpose: a disconnect does a hard deleteMany on
// BrokerageConnection, so the row can vanish while a sync is failing.
// `update` throws "record not found" in that case; `updateMany` simply
// matches nothing, which is the correct outcome (there is no lock left to
// release) and needs no error handling at all.
//
// Every OTHER database error still throws by default. An earlier version
// caught everything here, which also hid transient failures (SQLITE_BUSY):
// the caller then reported "failed" while the row stayed SYNCING with no
// error recorded, blocking every sync until the stale-lock window passed.
// Letting it throw gives the caller's own catch-all one more attempt.
//
// `bestEffort` is for that catch-all, the last place anything can be done:
// there the error is logged and swallowed so an already-failing sync never
// surfaces a second, raw database error to the client. If the row really
// could not be updated, acquireSyncLock's stale-lock recovery still reclaims
// it after staleLockMs.
export async function releaseSyncLockAsFailed(
  connectionId: string,
  params: { syncError: string; lastFailedSyncAt: Date; needsAttention: boolean },
  options?: { bestEffort?: boolean }
): Promise<void> {
  try {
    await prisma.brokerageConnection.updateMany({
      where: { id: connectionId },
      data: {
        syncStatus: "FAILED",
        syncError: params.syncError,
        lastFailedSyncAt: params.lastFailedSyncAt,
        ...(params.needsAttention ? { status: "ERROR" } : {}),
      },
    });
  } catch (err) {
    if (!options?.bestEffort) throw err;
    console.error(
      `[sync-lock] could not record the sync failure for connection ${connectionId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
