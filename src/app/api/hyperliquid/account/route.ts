// GET /api/hyperliquid/account?address=0x...
//
// Bundles clearinghouse state + open orders + recent fills into one
// response (three separate upstream calls, no combined Hyperliquid
// endpoint exists — but the account panel always needs all three
// together). Gated behind CompassFinance auth for product consistency
// (this is presented as an authenticated-user feature), but the actual
// Hyperliquid call is address-only: requireUserId()'s return value is
// discarded immediately, never passed to the service layer or the
// upstream request — that's what keeps this route free of any internal
// user id, satisfying "never expose internal user ids in client-visible
// Hyperliquid requests" structurally rather than by convention.

import { requireUserId } from "@/server/auth/session";
import { ApiError, withApiErrorHandling } from "@/server/api-helpers";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { isValidEvmAddress } from "@/server/validation";
import { getHyperliquidAccount, getHyperliquidOpenOrders, getHyperliquidUserFills } from "@/server/hyperliquid/service";

// Not exported: a Next.js route module may only export its handlers and route config.
const HYPERLIQUID_ACCOUNT_MAX_REQUESTS_PER_MINUTE = 120;

export async function GET(req: Request) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId(); // auth gate only — never forwarded

    // Bundles three real upstream Hyperliquid requests per call, so a
    // runaway client loop must not be able to hammer it. The ceiling is far
    // above the limiter's default on purpose: this route is POLLED. One
    // trading page runs two account panels (main dex + xyz) at one request
    // each per 30s, and confirming a transfer adds a burst of up to eight
    // more within ten seconds — the default of 12/minute was reached by
    // ordinary use with two tabs open, which blanked both panels and made a
    // transfer that had succeeded report as unconfirmed.
    if (!checkRateLimit(`hyperliquid-account:${userId}`, { max: HYPERLIQUID_ACCOUNT_MAX_REQUESTS_PER_MINUTE })) {
      throw new ApiError("Too many requests — please wait a moment before trying again.", 429);
    }

    const url = new URL(req.url);
    const address = url.searchParams.get("address");
    if (!address || !isValidEvmAddress(address)) {
      throw new ApiError("A valid address query parameter is required");
    }
    // Phase 8: an optional HIP-3 dex ("xyz") reads that dex's own
    // ISOLATED margin pool instead of the main dex's — never a filtered
    // view of one shared balance (verified live: the same address holds
    // a genuinely different balance per dex). Omitted (or empty) means
    // the main dex, exactly the pre-Phase-8 behavior BTC/ETH still use.
    const dex = url.searchParams.get("dex") || undefined;

    const [account, openOrders, fills] = await Promise.all([
      getHyperliquidAccount(address, dex),
      getHyperliquidOpenOrders(address, dex),
      getHyperliquidUserFills(address, 20),
    ]);

    return { account, openOrders, fills };
  });
}
