import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { syncTrading212 } from "@/server/trading212/trading212-sync";

// Phase 2 — the "Sync" button's endpoint; Phase 5 — now shares its engine
// (and its locking) with the automatic scheduler (see
// trading212-scheduler.ts). userId always comes from requireUserId() (the
// session), never the request body — see api-routes-idor.test.ts's
// structural scan of every route under this directory for exactly that
// invariant. Read-only against Trading 212 itself: this never places,
// modifies, or cancels anything there.

export async function POST() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const result = await syncTrading212(userId);

    if (result.status === "not_connected") {
      throw new Error("Connect a Trading 212 account before syncing");
    }
    // "already_syncing" (the automatic scheduler is mid-run for this same
    // connection, or a duplicate click raced this same request) and
    // "failed" are both legitimate, non-throwing outcomes here — the
    // manual sync button isn't broken, it's telling the truth about what
    // happened. syncTrading212 already reduces any upstream failure to a
    // small set of safe, sanitized messages — never a raw API response or
    // a credential-bearing error — so the full result is safe to return
    // as-is.
    return result;
  });
}
