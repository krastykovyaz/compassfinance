import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { fetchInteractiveBrokersAccessToken } from "@/server/interactive-brokers/interactive-brokers-client";
import {
  IBKR_OAUTH_STATE_COOKIE_NAME,
  decodeOAuthState,
} from "@/server/interactive-brokers/interactive-brokers-oauth-state";
import { completeInteractiveBrokersOAuthConnection } from "@/server/repositories/interactive-brokers-repository";

// The OAuth 1.0a callback IBKR redirects the user's browser back to after
// they authorize (or deny) CompassFinance on IBKR's own site, carrying
// `oauth_token` (the request token) and `oauth_verifier` as query params.
//
// This route is the one place a stolen/forged callback URL could
// otherwise attach a connection to the wrong account, so it checks THREE
// independent things before ever calling completeInteractiveBrokersOAuth
// Connection, and rejects (redirecting back with a safe, generic error —
// never a raw provider error) if any one of them fails:
//   1. The signed state cookie set by oauth/start exists, verifies, and
//      hasn't expired (see interactive-brokers-oauth-state.ts) — proves
//      this callback belongs to a request THIS browser actually started.
//   2. The cookie's own requestToken matches the oauth_token IBKR sent
//      back — proves the callback is for the token this browser was
//      given, not a different, possibly-stolen one.
//   3. The CURRENTLY signed-in user matches the userId recorded in the
//      cookie at start time — the specific "one user's OAuth callback
//      cannot attach credentials to another user's account" requirement.
//      A session change between start and callback (different tab,
//      different account) is rejected, not silently reattributed.

const CONNECTED_ACCOUNTS_PATH = "/profile/connected-accounts";

function errorRedirect(req: NextRequest, reason: string): NextResponse {
  const response = NextResponse.redirect(new URL(`${CONNECTED_ACCOUNTS_PATH}?ibkr=error&reason=${reason}`, req.url));
  response.cookies.delete(IBKR_OAUTH_STATE_COOKIE_NAME);
  return response;
}

export async function GET(req: NextRequest) {
  const oauthToken = req.nextUrl.searchParams.get("oauth_token");
  const oauthVerifier = req.nextUrl.searchParams.get("oauth_verifier");
  // A denied/cancelled authorization, or an expired/invalid request from
  // IBKR's side, shows up as missing params — IBKR's own docs don't
  // describe a separate error query param for this case, so "missing
  // either param" is treated as the one denial/invalid signal there is.
  if (!oauthToken || !oauthVerifier) {
    return errorRedirect(req, "denied");
  }

  const cookieValue = req.cookies.get(IBKR_OAUTH_STATE_COOKIE_NAME)?.value;
  if (!cookieValue) {
    return errorRedirect(req, "expired");
  }

  const state = decodeOAuthState(cookieValue);
  if (!state || state.requestToken !== oauthToken) {
    return errorRedirect(req, "invalid_state");
  }

  // requireUserId() itself never accepts a client-supplied id (Section
  // 20) — it is the CURRENT session only, which is exactly the value
  // being checked against the cookie's recorded userId below.
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return errorRedirect(req, "session_expired");
  }
  if (userId !== state.userId) {
    return errorRedirect(req, "invalid_state");
  }

  const result = await fetchInteractiveBrokersAccessToken(oauthToken, oauthVerifier);
  if (!result.ok) {
    return errorRedirect(req, "exchange_failed");
  }

  await completeInteractiveBrokersOAuthConnection(userId, result.data.accessToken, result.data.accessTokenSecret);

  const response = NextResponse.redirect(new URL(`${CONNECTED_ACCOUNTS_PATH}?ibkr=connected`, req.url));
  response.cookies.delete(IBKR_OAUTH_STATE_COOKIE_NAME);
  return response;
}
