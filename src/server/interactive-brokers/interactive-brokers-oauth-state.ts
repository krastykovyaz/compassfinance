import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Correlates the "start connection" step with the "callback" step without
// a new database table — reasoned as the smaller, more standard change
// than a "pending OAuth request" table (this is a short-lived,
// single-use, per-browser value; a DB row would need its own cleanup job
// for exactly the same lifetime a cookie already has for free).
//
// Signed (HMAC-SHA256) and verified server-side so a tampered cookie is
// detected and rejected, not trusted. The cookie is also HttpOnly +
// Secure + SameSite=Lax when set (see the oauth/start route) — Lax, not
// Strict, because the callback arrives as a top-level cross-site GET
// navigation from IBKR's own domain, and a Strict cookie would not be
// sent on that navigation at all.
//
// Reuses AUTH_SECRET (already a required production secret for Auth.js)
// rather than introducing a second signing secret nothing else needs.

export const IBKR_OAUTH_STATE_COOKIE_NAME = "ibkr_oauth_state";
export const IBKR_OAUTH_STATE_MAX_AGE_SECONDS = 600; // 10 minutes — enough for a real IBKR login, short enough to bound a stale/replayed cookie's usefulness

export type InteractiveBrokersOAuthState = {
  userId: string;
  requestToken: string;
  issuedAt: number;
};

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set — required to sign the Interactive Brokers OAuth state cookie"
    );
  }
  return secret;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSigningSecret()).update(payloadB64).digest("base64url");
}

/** Encodes {userId, requestToken, issuedAt} into a signed, opaque cookie
 * value: base64url(JSON payload) + "." + HMAC-SHA256 signature. */
export function encodeOAuthState(state: InteractiveBrokersOAuthState): string {
  const payloadB64 = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Reverses encodeOAuthState(), verifying the signature with a
 * constant-time comparison and rejecting (returning null, never
 * throwing) anything tampered, malformed, or older than
 * IBKR_OAUTH_STATE_MAX_AGE_SECONDS. Never trusts the decoded payload's
 * shape without checking every field's type explicitly. */
export function decodeOAuthState(cookieValue: string): InteractiveBrokersOAuthState | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  const expected = sign(payloadB64);
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).userId !== "string" ||
      typeof (parsed as Record<string, unknown>).requestToken !== "string" ||
      typeof (parsed as Record<string, unknown>).issuedAt !== "number"
    ) {
      return null;
    }
    const state = parsed as InteractiveBrokersOAuthState;
    if (Date.now() - state.issuedAt > IBKR_OAUTH_STATE_MAX_AGE_SECONDS * 1000) return null;
    return state;
  } catch {
    return null;
  }
}
