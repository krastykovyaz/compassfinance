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
import { withApiErrorHandling } from "@/server/api-helpers";
import { isValidEvmAddress } from "@/server/validation";
import { getHyperliquidAccount, getHyperliquidOpenOrders, getHyperliquidUserFills } from "@/server/hyperliquid/service";

export async function GET(req: Request) {
  return withApiErrorHandling(async () => {
    await requireUserId(); // auth gate only — never forwarded

    const address = new URL(req.url).searchParams.get("address");
    if (!address || !isValidEvmAddress(address)) {
      throw new Error("A valid address query parameter is required");
    }

    const [account, openOrders, fills] = await Promise.all([
      getHyperliquidAccount(address),
      getHyperliquidOpenOrders(address),
      getHyperliquidUserFills(address, 20),
    ]);

    return { account, openOrders, fills };
  });
}
