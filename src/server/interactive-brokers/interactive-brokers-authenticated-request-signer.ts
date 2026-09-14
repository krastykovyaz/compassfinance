import "server-only";
import { createHmac } from "crypto";
import {
  buildAuthorizationHeaderValue,
  buildSignatureBaseString,
  generateNonce,
  generateTimestamp,
} from "./interactive-brokers-oauth-signer";

// The signing scheme for every IBKR API call AFTER the OAuth handshake +
// Live Session Token derivation are done — verified against
// ibkrcampus.com/docs/web-api/authentication/oauth-1a/authenticated-
// requests.md ("Standard Structure for Authenticated Requests"). This is
// deliberately a SEPARATE signer from interactive-brokers-oauth-
// signer.ts's RSA-SHA256 one: IBKR's own docs describe this as "the clear
// dividing line between the one-time handshake phase" (RSA, asymmetric,
// application's own private key) "and the ongoing operational phase"
// (HMAC-SHA256, symmetric, keyed by the per-session Live Session Token).
// Every /portfolio/* call in interactive-brokers-client.ts goes through
// this one function — there is exactly one place that builds this header
// shape, not one per endpoint.

export type BuildAuthenticatedRequestAuthorizationHeaderArgs = {
  method: string;
  url: string;
  consumerKey: string;
  /** The Access Token (not the Request Token) — identifies which user's
   * authorization this call is made under. */
  accessToken: string;
  /** Base64 — decoded to raw bytes here to serve as the HMAC key,
   * exactly as IBKR's own reference implementation does. */
  liveSessionToken: string;
  realm: string;
};

/** Builds the `Authorization: OAuth ...` header for any authenticated
 * IBKR portfolio-read call. Per the source page: query-string parameters
 * are NOT included in the signature base string for this step (unlike
 * the strict OAuth 1.0a core spec) — IBKR's own documented reference
 * implementation explicitly calls this out, so query params (if any) are
 * simply not passed into this function's signed param set. */
export function buildAuthenticatedRequestAuthorizationHeader(
  args: BuildAuthenticatedRequestAuthorizationHeaderArgs
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: args.consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: generateTimestamp(),
    oauth_token: args.accessToken,
    realm: args.realm,
  };

  const baseString = buildSignatureBaseString(args.method, args.url, oauthParams);
  const key = Buffer.from(args.liveSessionToken, "base64");
  const signature = createHmac("sha256", key).update(baseString, "utf8").digest("base64");

  return buildAuthorizationHeaderValue({ ...oauthParams, oauth_signature: signature });
}
