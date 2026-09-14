import { NextRequest, NextResponse } from "next/server";
import { requireUserId, UnauthenticatedError } from "@/server/auth/session";
import {
  fetchInteractiveBrokersRequestToken,
  getInteractiveBrokersAuthorizeUrl,
} from "@/server/interactive-brokers/interactive-brokers-client";
import {
  IBKR_OAUTH_STATE_COOKIE_NAME,
  IBKR_OAUTH_STATE_MAX_AGE_SECONDS,
  encodeOAuthState,
} from "@/server/interactive-brokers/interactive-brokers-oauth-state";

// Starts the OAuth 1.0a Third-Party workflow: generate a Request Token,
// remember which CompassFinance user asked for it (in a signed, HttpOnly
// cookie — see interactive-brokers-oauth-state.ts for why a cookie rather
// than a new DB table), then send the browser to IBKR's OWN login page.
// CompassFinance never asks for or sees an IBKR username/password at any
// point in this flow.
//
// This is a real top-level browser navigation target (a <Connect> link,
// not a fetch() call) — its user-facing outcome is always either a
// redirect to IBKR or a redirect back into the app with an error reason,
// never a JSON body a page would have to render.

const CONNECTED_ACCOUNTS_PATH = "/profile/connected-accounts";

function errorRedirect(req: NextRequest, reason: string): NextResponse {
  return NextResponse.redirect(new URL(`${CONNECTED_ACCOUNTS_PATH}?ibkr=error&reason=${reason}`, req.url));
}

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.redirect(new URL("/signin", req.url));
    }
    throw err;
  }

  const result = await fetchInteractiveBrokersRequestToken();
  if (!result.ok) {
    return errorRedirect(req, result.reason === "not_configured" ? "not_configured" : "start_failed");
  }

  const state = encodeOAuthState({
    userId,
    requestToken: result.data.requestToken,
    issuedAt: Date.now(),
  });

  const response = NextResponse.redirect(getInteractiveBrokersAuthorizeUrl(result.data.requestToken));
  response.cookies.set({
    name: IBKR_OAUTH_STATE_COOKIE_NAME,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IBKR_OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return response;
}
