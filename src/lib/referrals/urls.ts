import type { NextRequest } from "next/server";

/**
 * Derives the public-facing origin from the incoming request's headers
 * rather than `req.nextUrl.origin` / `req.url` — self-hosted behind nginx,
 * those reflect the Next.js server's own bind address (e.g.
 * "http://localhost:3002"), not the proxied domain, even though the
 * `Host`/`X-Forwarded-*` headers nginx sets are correct. Mirrors the same
 * header-trust approach Auth.js's `trustHost` uses internally.
 */
export function getRequestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Builds the shareable referral URL for a given origin + code. `origin`
 * is taken from the actual incoming request (see the API route) rather
 * than a hardcoded/invented domain — it's always the real host the app
 * is currently served from, dev or production alike.
 */
export function buildReferralUrl(origin: string, code: string): string {
  return `${origin}/invite/${code}`;
}

export function buildAchievementShareUrl(origin: string, token: string): string {
  return `${origin}/share/achievement/${token}`;
}
