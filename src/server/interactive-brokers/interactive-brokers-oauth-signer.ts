import "server-only";
import { createSign, randomBytes } from "crypto";

// OAuth 1.0a request signing, RSA-SHA256 variant — the ONLY signature
// method IBKR's third-party workflow supports (see
// docs/integrations/interactive-brokers-phase-0.md §3.E: "only RSA-SHA256
// is currently supported, not PLAINTEXT"). This implements the standard,
// published OAuth 1.0a signature-base-string construction from RFC 5849
// (the same algorithm underlies HMAC-SHA1/PLAINTEXT variants too — only
// the final signing step differs) — nothing here is IBKR-specific except
// which two endpoints it's used against (see interactive-brokers-client.ts).

/** RFC 3986 percent-encoding — stricter than encodeURIComponent, which
 * leaves !*'() unescaped. OAuth 1.0a's base-string construction requires
 * the RFC 3986 form specifically (RFC 5849 §3.6). */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/** RFC 5849 §3.4.1.1 — sorts params by key then value (after each is
 * percent-encoded) and joins as `k=v&k=v...`. */
function buildParameterString(params: Record<string, string>): string {
  return Object.keys(params)
    .map((key) => [percentEncode(key), percentEncode(params[key])])
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/** RFC 5849 §3.4.1 — the exact string that gets signed:
 * METHOD&percent-encode(base-url)&percent-encode(sorted-param-string).
 * `url` must already exclude the query string — every param (OAuth params
 * and, for these two IBKR endpoints, nothing else) is passed in `params`
 * instead, never appended to the URL itself. */
export function buildSignatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  return [method.toUpperCase(), percentEncode(url), percentEncode(buildParameterString(params))].join("&");
}

/** RFC 5849 §3.4.3 — signs the base string with CompassFinance's RSA
 * private key (the one whose public half is registered with IBKR at
 * onboarding) and returns the base64-encoded signature. */
export function signWithRsaSha256(baseString: string, privateKeyPem: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(baseString, "utf8");
  signer.end();
  return signer.sign(privateKeyPem, "base64");
}

/** RFC 5849 §3.5.1 — builds the `Authorization: OAuth ...` header from a
 * final param set (already including oauth_signature). Each value is
 * individually percent-encoded and quoted, comma-separated, sorted by key
 * for a deterministic (though not spec-required) ordering. Exported (not
 * just used below) because Phase 2's Live Session Token request and every
 * post-LST authenticated request (interactive-brokers-live-session-
 * token.ts, interactive-brokers-authenticated-request-signer.ts) build
 * this exact same header shape — just with a different signature
 * algorithm and, for those, a trailing `realm` param — so the joining
 * logic itself is shared rather than reimplemented per signer. */
export function buildAuthorizationHeaderValue(oauthParams: Record<string, string>): string {
  const parts = Object.keys(oauthParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`);
  return `OAuth ${parts.join(", ")}`;
}

export type BuildOAuthAuthorizationHeaderArgs = {
  method: string;
  url: string;
  consumerKey: string;
  privateKeyPem: string;
  /** The request token (Generate Access Tokens step) or omitted entirely
   * (Generate a Request Token step, which has no token yet). */
  token?: string;
  /** Only present for the access-token exchange. */
  verifier?: string;
};

/** Builds a complete, signed `Authorization` header value for one of
 * IBKR's two OAuth 1.0a endpoints (POST /oauth/request_token or POST
 * /oauth/access_token — see interactive-brokers-client.ts). A fresh
 * nonce/timestamp is generated per call, so the same logical request
 * signed twice never produces an identical header. */
export function buildOAuthAuthorizationHeader(args: BuildOAuthAuthorizationHeaderArgs): string {
  const baseOAuthParams: Record<string, string> = {
    oauth_consumer_key: args.consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "RSA-SHA256",
    oauth_timestamp: generateTimestamp(),
    oauth_version: "1.0",
  };
  if (args.token) baseOAuthParams.oauth_token = args.token;
  if (args.verifier) baseOAuthParams.oauth_verifier = args.verifier;

  const baseString = buildSignatureBaseString(args.method, args.url, baseOAuthParams);
  const signature = signWithRsaSha256(baseString, args.privateKeyPem);

  return buildAuthorizationHeaderValue({ ...baseOAuthParams, oauth_signature: signature });
}
