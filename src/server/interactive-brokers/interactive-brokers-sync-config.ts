import "server-only";

// Phase 2 — no scheduler/cron integration exists for Interactive Brokers
// (manual sync only, per this phase's own "do not invent a new UX unless
// required" / "if manual sync does not currently exist... do not invent"
// instructions — IBKR simply reuses Trading 212's already-existing manual
// "Sync" button pattern, not its automatic scheduler). The one piece of
// sync config Phase 2 still genuinely needs is the stale-lock recovery
// window for acquireSyncLock (src/server/brokerage/sync-lock.ts) — a
// manual sync can still crash mid-request, and without this a wedged
// SYNCING row would never recover.

const DEFAULT_STALE_LOCK_MINUTES = 10;

export function getInteractiveBrokersStaleLockMs(): number {
  const raw = Number(process.env.IBKR_SYNC_STALE_LOCK_MINUTES);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STALE_LOCK_MINUTES;
  return minutes * 60_000;
}

// Phase 3 — POST /pa/transactions is rate-limited by IBKR itself to 1
// request per 15 minutes GLOBALLY (confirmed against two official IBKR
// pacing-limitation pages — see interactive-brokers-client.ts's own
// header comment on this endpoint). This cooldown must never be
// configured BELOW IBKR's own documented limit (that would risk IBKR
// throttling or blocking the connection outright) — only upward, for an
// operator who wants an extra safety margin. Enforced by
// interactive-brokers-sync.ts's activity step against
// BrokerageConnection.lastActivitySyncAt.
const IBKR_TRANSACTIONS_RATE_LIMIT_MINUTES = 15;

export function getInteractiveBrokersActivityCooldownMs(): number {
  const raw = Number(process.env.IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= IBKR_TRANSACTIONS_RATE_LIMIT_MINUTES ? raw : IBKR_TRANSACTIONS_RATE_LIMIT_MINUTES;
  return minutes * 60_000;
}
