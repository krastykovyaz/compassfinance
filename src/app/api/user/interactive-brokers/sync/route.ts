import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { syncInteractiveBrokersForUser } from "@/server/interactive-brokers/interactive-brokers-flex-sync";

// Phase 2 — the "Sync" button's endpoint, mirroring POST /api/user/
// trading212/sync exactly: manual sync only, no scheduler/cron wired up
// for Interactive Brokers (see interactive-brokers-sync-config.ts). userId
// always comes from requireUserId(), never the request body — see
// api-routes-idor.test.ts. Read-only against Interactive Brokers itself:
// this never places, modifies, or cancels anything there.

export async function POST() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();

    // The sync lock only serializes concurrent calls, it doesn't throttle
    // repeat calls — without this, a tight client loop can spend the
    // app's single shared IBKR_CONSUMER_KEY's upstream rate budget (each
    // sync does several real IBKR requests including the LST derivation).
    if (!checkRateLimit(`ibkr-sync:${userId}`)) {
      throw new Error("Too many requests — please wait a moment before trying again.");
    }

    const result = await syncInteractiveBrokersForUser(userId);

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
