import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { syncInteractiveBrokers } from "@/server/interactive-brokers/interactive-brokers-sync";

// Phase 2 — the "Sync" button's endpoint, mirroring POST /api/user/
// trading212/sync exactly: manual sync only, no scheduler/cron wired up
// for Interactive Brokers (see interactive-brokers-sync-config.ts). userId
// always comes from requireUserId(), never the request body — see
// api-routes-idor.test.ts. Read-only against Interactive Brokers itself:
// this never places, modifies, or cancels anything there.

export async function POST() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const result = await syncInteractiveBrokers(userId);

    if (result.status === "not_connected") {
      throw new Error("Connect an Interactive Brokers account before syncing");
    }
    // "already_syncing", "needs_account_selection", and "failed" are all
    // legitimate, non-throwing outcomes — syncInteractiveBrokers already
    // reduces any upstream failure to a small set of safe, sanitized
    // messages, so the full result is safe to return as-is.
    return result;
  });
}
