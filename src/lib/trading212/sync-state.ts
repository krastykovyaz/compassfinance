// Pure "what should the sync-status UI show" logic (Requirement 10),
// shared by Trading212Card (Settings page) and Trading212AccountPanel
// (Portfolio page) so the two places that display sync state can never
// drift apart. Kept separate from any component so it's directly
// testable without a renderer (this repo's test setup has no jsdom/
// @testing-library — see hyperliquid-account-panel.tsx's own
// resolveHyperliquidPanelView for the established precedent).
//
// Deliberately client-safe (no server-only import): the staleness
// thresholds below are a pure DISPLAY heuristic with no security or data-
// correctness implication, so they're plain constants here rather than
// routed through trading212-sync-config.ts's server-only env reads (which
// own the SYNC INTERVAL itself — the thing Requirement 2 actually needs
// configurable without a redeploy). Requirement 15's own thresholds
// (30min/120min) are used as the fixed defaults.

export type Trading212Staleness = "fresh" | "stale" | "very_stale";

const FRESH_THRESHOLD_MS = 30 * 60_000;
const STALE_THRESHOLD_MS = 120 * 60_000;

export function classifyTrading212Staleness(lastSyncAt: string, now: Date = new Date()): Trading212Staleness {
  const ageMs = now.getTime() - new Date(lastSyncAt).getTime();
  if (ageMs < FRESH_THRESHOLD_MS) return "fresh";
  if (ageMs < STALE_THRESHOLD_MS) return "stale";
  return "very_stale";
}

export type Trading212SyncStateView =
  | { kind: "never_synced" }
  | { kind: "syncing" }
  | { kind: "synced"; lastSyncAt: string; staleness: Trading212Staleness }
  | {
      kind: "failed";
      message: string;
      lastSyncAt: string | null;
      /** Requirement 12: only true for a credential-invalidating
       * (AUTHENTICATION/PERMISSION) failure — connection.status is
       * "ERROR" exactly then (see trading212-sync.ts). Every other
       * failure category is transient and shouldn't alarm the user with
       * "needs attention" language, since the next scheduled sync will
       * likely just resolve it on its own. */
      needsAttention: boolean;
    };

export function describeTrading212SyncState(connection: {
  syncStatus: "NEVER_SYNCED" | "SYNCING" | "SYNCED" | "FAILED";
  syncError: string | null;
  lastSyncAt: string | null;
  connectionStatus?: "CONNECTED" | "DISCONNECTED" | "ERROR";
  now?: Date;
}): Trading212SyncStateView {
  if (connection.syncStatus === "SYNCING") return { kind: "syncing" };
  // A FAILED status always wins over any stale lastSyncAt from a prior
  // success — the user needs to see the failure, not a misleadingly
  // reassuring old timestamp with no indication anything went wrong.
  if (connection.syncStatus === "FAILED") {
    return {
      kind: "failed",
      message: connection.syncError ?? "Sync failed",
      lastSyncAt: connection.lastSyncAt,
      needsAttention: connection.connectionStatus === "ERROR",
    };
  }
  if (connection.lastSyncAt) {
    return { kind: "synced", lastSyncAt: connection.lastSyncAt, staleness: classifyTrading212Staleness(connection.lastSyncAt, connection.now) };
  }
  return { kind: "never_synced" };
}
