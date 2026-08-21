import { NextRequest, NextResponse } from "next/server";

// Milestone 24: referral-code capture. A visitor who opens /invite/<code>
// needs that code to survive all the way through sign-in (magic link or
// OAuth, both of which redirect through several hops) so it's readable
// later in auth.ts's events.createUser callback — a cookie is the
// standard way to carry that. This is the only thing this file does
// beyond the no-op passthrough described below; it never redirects and
// never blocks any route.
const REFERRAL_COOKIE = "compass_referral_code";
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const REFERRAL_CODE_PATTERN = /^\/invite\/([A-Za-z0-9]{4,32})$/;

// Milestone 12, Section 7 ("guest mode"): the app must be usable for
// public learning/news exploration without an account. The previous
// version of this file called `auth()` and redirected to /signin on
// EVERY route except /signin and /api/auth — that was wrong: it forced
// authentication globally, and it meant a misconfigured/missing
// AUTH_SECRET took down every single page, not just the account
// features that actually need a session.
//
// The real security boundary was never this file — it's
// requireUserId() (src/server/auth/session.ts), which every user-data
// API route already calls directly. This proxy no longer needs to call
// auth() at all: there is nothing left for it to gate. It's kept as a
// no-op passthrough (rather than deleted) so future routes that
// genuinely need a hard redirect-gate (if any are ever added) have an
// obvious, already-wired place to add one, with the reasoning for why
// there currently isn't one written down right here.
export default function proxy(request?: NextRequest) {
  const response = NextResponse.next();

  if (request) {
    const match = request.nextUrl.pathname.match(REFERRAL_CODE_PATTERN);
    if (match) {
      response.cookies.set(REFERRAL_COOKIE, match[1], {
        httpOnly: true,
        sameSite: "lax",
        maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
        path: "/",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Effectively unused while proxy() is a no-op, but kept accurate
    // (Next internals/static assets excluded) so re-introducing any
    // route-specific logic later doesn't also require re-deriving this.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
