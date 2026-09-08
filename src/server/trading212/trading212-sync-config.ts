import "server-only";

// Phase 5 — Requirement 2: the sync interval is configurable through
// environment rather than hardcoded across the scheduler, the lock
// staleness check, and the UI's staleness banner. Every one of those
// reads it from here, never from its own copy of the number.

const DEFAULT_INTERVAL_MINUTES = 15;
// A stale-lock recovery window shorter than the sync interval itself —
// long enough that no real sync should ever still be running (Phase 2's
// own page caps bound how long a sync can take), short enough that a
// crashed process's stuck "SYNCING" row recovers well before the next
// scheduled cycle would otherwise skip it entirely.
const DEFAULT_STALE_LOCK_MINUTES = 10;
// Requirement 10: bounded concurrency across connections in one
// scheduler cycle — never an unbounded Promise.all over every user.
const DEFAULT_MAX_CONCURRENT_SYNCS = 3;

function readPositiveIntMinutes(envVar: string, fallbackMinutes: number): number {
  const raw = Number(process.env[envVar]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallbackMinutes;
}

export function getTrading212SyncIntervalMs(): number {
  return readPositiveIntMinutes("TRADING212_SYNC_INTERVAL_MINUTES", DEFAULT_INTERVAL_MINUTES) * 60_000;
}

export function getTrading212StaleLockMs(): number {
  return readPositiveIntMinutes("TRADING212_SYNC_STALE_LOCK_MINUTES", DEFAULT_STALE_LOCK_MINUTES) * 60_000;
}

export function getTrading212MaxConcurrentSyncs(): number {
  const raw = Number(process.env.TRADING212_SYNC_MAX_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_CONCURRENT_SYNCS;
}

/** Whether instrumentation.ts should start the in-process scheduler at
 * all. Defaults to "on in production, off everywhere else" (dev/test
 * runs never want a background job silently syncing a real Trading 212
 * account every 15 minutes) — either can be overridden explicitly, so an
 * operator has a kill-switch in production and a way to exercise the
 * real scheduler locally if genuinely needed. */
export function isTrading212AutoSyncEnabled(): boolean {
  const explicit = process.env.TRADING212_AUTO_SYNC_ENABLED;
  if (explicit === "false") return false;
  if (explicit === "true") return true;
  return process.env.NODE_ENV === "production";
}

/** The shared secret protecting POST /api/cron/trading212-sync — never
 * exposed to the browser (not a NEXT_PUBLIC_* var), and the route itself
 * refuses every request when this isn't configured, so an operator can't
 * accidentally leave the endpoint open by forgetting to set it. */
export function getTrading212CronSecret(): string | null {
  const secret = process.env.TRADING212_SYNC_CRON_SECRET;
  return secret && secret.length > 0 ? secret : null;
}
