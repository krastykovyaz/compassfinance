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
