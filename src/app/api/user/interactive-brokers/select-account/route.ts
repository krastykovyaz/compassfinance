import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { ApiError, withApiErrorHandling } from "@/server/api-helpers";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { discoverInteractiveBrokersAccounts } from "@/server/interactive-brokers/interactive-brokers-sync";
import { setInteractiveBrokersSelectedAccount } from "@/server/repositories/interactive-brokers-repository";

// Milestone 21 — the minimum API needed for a user to choose which IBKR
// account to sync when discovery finds more than one (see
// syncInteractiveBrokers's "needs_account_selection" outcome). userId
// always comes from requireUserId(), never the request body — see
// api-routes-idor.test.ts.
//
// The submitted accountId is NEVER trusted outright: this route re-runs
// discovery (authenticate + GET /portfolio/accounts) itself and only
// persists the choice if it's actually among the accounts IBKR reports
// right now for THIS user's own connection — the same reasoning as
// requireUserId() itself, applied to a value the client supplies. A
// stale or fabricated accountId is rejected, not stored.

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();

    // Each call re-authenticates against IBKR (RSA + Diffie-Hellman live-
    // session-token derivation, then a real /portfolio/accounts request)
    // before the submitted accountId is even validated — without a limit
    // here, a tight client loop burns the app's single shared
    // IBKR_CONSUMER_KEY's rate budget for every user.
    if (!checkRateLimit(`ibkr-select-account:${userId}`)) {
      throw new ApiError("Too many requests — please wait a moment before trying again.", 429);
    }

    const body = await req.json().catch(() => null);
    const accountId = body?.accountId;
    if (typeof accountId !== "string" || !accountId.trim()) {
      throw new ApiError("An Interactive Brokers account id is required");
    }

    const discovery = await discoverInteractiveBrokersAccounts(userId);
    if (!discovery.ok) {
      throw new ApiError(discovery.message);
    }
    if (!discovery.accounts.some((a) => a.accountId === accountId)) {
      throw new ApiError("That account is no longer available for this Interactive Brokers connection");
    }

    await setInteractiveBrokersSelectedAccount(userId, accountId);
    return { selected: accountId };
  });
}
