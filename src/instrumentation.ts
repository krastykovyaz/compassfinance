// Next.js's own official hook for "run code once when the server starts"
// (stable since Next 15, no experimental flag needed) — see
// https://nextjs.org/docs/app/guides/instrumentation. This IS the correct
// existing application mechanism for scheduled server-side work in this
// deployment: CompassFinance runs as a single, persistent, systemd-managed
// `next start` process on a VPS (see /etc/systemd/system/compass.service),
// not on a serverless/edge platform — a long-lived Node process can safely
// own a real setInterval-driven scheduler, unlike a Vercel-style deployment
// where nothing persists between invocations. There is no other
// cron/queue/job system anywhere in this codebase (verified before writing
// this file — no node-cron, no BullMQ, no vercel.json cron config, no
// systemd timer unit) — so this file, plus
// trading212-scheduler.ts's runTrading212AutoSyncCycle(), together ARE the
// scheduling mechanism, not a second one competing with something that
// already existed.

export async function register() {
  // register() runs in both the Node.js and Edge runtimes when both are
  // configured for a project — this scheduler needs real Node APIs
  // (Prisma, setInterval semantics that survive for the process's life)
  // and must only ever start once per server process.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { isTrading212AutoSyncEnabled } = await import("@/server/trading212/trading212-sync-config");
  if (!isTrading212AutoSyncEnabled()) return;

  const { getTrading212SyncIntervalMs } = await import("@/server/trading212/trading212-sync-config");
  const { runTrading212AutoSyncCycle } = await import("@/server/trading212/trading212-scheduler");

  const intervalMs = getTrading212SyncIntervalMs();
  const timer = setInterval(() => {
    runTrading212AutoSyncCycle().catch((err) => {
      // A cycle-level failure must never crash the interval itself, or
      // every future cycle silently stops firing until the next deploy
      // restarts the process.
      console.error("[trading212-scheduler] cycle threw unexpectedly:", err instanceof Error ? err.message : err);
    });
  }, intervalMs);
  // Never blocks the process from exiting (e.g. during a graceful
  // shutdown) on its own account.
  timer.unref?.();
}
