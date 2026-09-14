import "server-only";
import { createHmac, privateDecrypt, randomBytes, constants as cryptoConstants, timingSafeEqual } from "crypto";
import {
  buildAuthorizationHeaderValue,
  buildSignatureBaseString,
  generateNonce,
  generateTimestamp,
  signWithRsaSha256,
} from "./interactive-brokers-oauth-signer";

// Live Session Token (LST) derivation — the step between Phase 1's OAuth
// handshake (Access Token + Access Token Secret) and any actual
// /portfolio/* call. Verified directly against IBKR's own documentation
// (ibkrcampus.com/docs/web-api/authentication/oauth-1a/lst/...), which
// Phase 0/1 explicitly deferred rather than researched in depth — this is
// new ground for this integration, not a reuse of anything from Phase 1's
// simpler RSA-SHA256-only request/access-token signing.
//
// The five-step sequence this file implements (see each function's own
// doc comment for its exact source page):
//   1. generateDhRandom + computeDiffieHellmanChallenge — the client's
//      half of a Diffie-Hellman exchange.
//   2. decryptAccessTokenSecret — PKCS#1 v1.5 RSA decryption of the
//      stored Access Token Secret, using a SEPARATE encryption key from
//      the one used for OAuth request signing.
//   3. buildLiveSessionTokenRequestAuthorizationHeader — signs a POST
//      /oauth/live_session_token request (see interactive-brokers-
//      client.ts for the actual HTTP call).
//   4. deriveLiveSessionToken — combines IBKR's response with the
//      client's own DH secret to compute the LST via HMAC-SHA1.
//   5. verifyLiveSessionToken — a MANDATORY check (never optional) that
//      the derivation matches IBKR's own independently-computed
//      signature, before the LST is ever trusted for a real API call.

/** A cryptographically random 256-bit integer — the client's private DH
 * exponent. Must never be transmitted, logged, or persisted; it is only
 * needed for the duration of one LST derivation. */
export function generateDhRandom(): bigint {
  return BigInt(`0x${randomBytes(32).toString("hex")}`);
}

/** Modular exponentiation (square-and-multiply) — Node's `crypto` module
 * has no built-in bigint modPow, and `base ** exponent % modulus` is
 * computationally infeasible at these (256-bit+) sizes without reducing
 * modulo `modulus` at every step. This is a standard, well-known
 * algorithm (not a novel or security-sensitive design of its own) —
 * correctness is verified in this module's tests via the Diffie-Hellman
 * commutativity property (both "sides" of an exchange must independently
 * arrive at the same shared secret). */
export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  const zero = BigInt(0);
  const one = BigInt(1);
  const two = BigInt(2);
  if (modulus === one) return zero;
  let result = one;
  let b = base % modulus;
  let e = exponent;
  while (e > zero) {
    if (e % two === one) result = (result * b) % modulus;
    e /= two;
    b = (b * b) % modulus;
  }
  return result;
}

/** Lowercase hex, no "0x" prefix, no padding — matches Python's
 * `hex(n)[2:]` exactly (the form IBKR's own documented reference
 * implementation uses for `dh_challenge`). */
function bigintToHex(n: bigint): string {
  return n.toString(16);
}

/** Step 1 (ibkrcampus.com .../lst/obtain-live-session-token-signature):
 * dh_challenge = generator^dh_random mod dh_prime. The generator is
 * always 2 (see interactive-brokers-config.ts's getInteractiveBrokersDhGenerator) —
 * only the prime is per-consumer-key. */
export function computeDiffieHellmanChallenge(dhRandom: bigint, generator: bigint, prime: bigint): string {
  return bigintToHex(modPow(generator, dhRandom, prime));
}

/** Strips RFC 8017 §7.2.2 EME-PKCS1-v1_5 padding from a raw (unpadded)
 * RSA decryption result: `0x00 || 0x02 || PS (>=8 non-zero bytes) || 0x00
 * || M`. Everything after the first 0x00 following the 2-byte header is
 * the message `M`. */
function stripPkcs1v15Padding(raw: Buffer): Buffer {
  if (raw[0] !== 0x00 || raw[1] !== 0x02) {
    throw new Error("Invalid PKCS#1 v1.5 padding — bad header bytes");
  }
  let i = 2;
  while (i < raw.length && raw[i] !== 0x00) i++;
  if (i >= raw.length) throw new Error("Invalid PKCS#1 v1.5 padding — no terminator byte found");
  if (i - 2 < 8) throw new Error("Invalid PKCS#1 v1.5 padding — padding string shorter than 8 bytes");
  return raw.subarray(i + 1);
}

/** Step 2 (same source page): the Access Token Secret is stored/received
 * as a base64 string but is actually RSA-PKCS#1v1.5-encrypted ciphertext.
 * Decrypting it (with the DISTINCT "encryption" RSA key, never the
 * signing key) and hex-encoding the result produces `prepend` — used as
 * both the HMAC message in deriveLiveSessionToken below AND, unusually,
 * as a literal string PREFIX (not a signed parameter) of the LST
 * request's own signature base string.
 *
 * Node's `crypto.privateDecrypt` REFUSES `RSA_PKCS1_PADDING` for private
 * decryption since the CVE-2023-46809 (Marvin Attack) hardening — that
 * protection targets a service that repeatedly decrypts many
 * ATTACKER-supplied ciphertexts and leaks a padding-validity oracle
 * through timing/error differences. That threat model doesn't apply
 * here: this decrypts CompassFinance's own Access Token Secret, received
 * once per connection directly from IBKR over the already-authenticated
 * OAuth exchange, never a value an adversary can resubmit to probe. IBKR's
 * own protocol fixes PKCS#1 v1.5 as the encryption scheme for this exact
 * value (not something CompassFinance can substitute), so decryption is
 * done via `RSA_NO_PADDING` (raw RSA, unaffected by the Node restriction)
 * followed by manual, RFC 8017-compliant padding removal above. */
export function decryptAccessTokenSecret(accessTokenSecretBase64: string, encryptionKeyPem: string): string {
  const ciphertext = Buffer.from(accessTokenSecretBase64, "base64");
  const raw = privateDecrypt({ key: encryptionKeyPem, padding: cryptoConstants.RSA_NO_PADDING }, ciphertext);
  const decrypted = stripPkcs1v15Padding(raw);
  return decrypted.toString("hex");
}

export type BuildLiveSessionTokenRequestAuthorizationHeaderArgs = {
  method: string;
  url: string;
  consumerKey: string;
  /** The SIGNING key (same one Phase 1's request_token/access_token
   * calls use) — never the encryption key. */
  signingKeyPem: string;
  accessToken: string;
  dhChallenge: string;
  /** The hex `prepend` from decryptAccessTokenSecret — prefixed directly
   * onto the signature base string, unencoded, with no separator. */
  prependHex: string;
  realm: string;
};

/** Step 3: signs `POST /oauth/live_session_token`. Structurally almost
 * identical to Phase 1's buildOAuthAuthorizationHeader (same RSA-SHA256
 * signing, same METHOD&URL&PARAMS base string via the shared
 * buildSignatureBaseString), with two documented differences unique to
 * this one endpoint: the base string is PREFIXED with `prependHex`
 * (direct concatenation, not a signed OAuth param), and the request
 * carries the IBKR-specific `diffie_hellman_challenge` param instead of
 * `oauth_verifier`. `realm` is included as an ordinary signed param
 * (IBKR's own two documented examples differ on whether realm is signed;
 * this follows the one that treats it as just another sorted, quoted
 * param — the more internally-consistent of the two, and the one
 * interactive-brokers-authenticated-request-signer.ts also follows for
 * every later request, so both signers share one convention). */
export function buildLiveSessionTokenRequestAuthorizationHeader(
  args: BuildLiveSessionTokenRequestAuthorizationHeaderArgs
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: args.consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "RSA-SHA256",
    oauth_timestamp: generateTimestamp(),
    oauth_token: args.accessToken,
    diffie_hellman_challenge: args.dhChallenge,
    realm: args.realm,
  };

  const baseString = args.prependHex + buildSignatureBaseString(args.method, args.url, oauthParams);
  const signature = signWithRsaSha256(baseString, args.signingKeyPem);

  return buildAuthorizationHeaderValue({ ...oauthParams, oauth_signature: signature });
}

export type DeriveLiveSessionTokenArgs = {
  dhRandom: bigint;
  /** IBKR's `diffie_hellman_response` — its own public DH value, hex-encoded. */
  dhResponseHex: string;
  dhPrime: bigint;
  prependHex: string;
};

/** Steps 4 (compute) — ibkrcampus.com .../lst/compute-live-session-token:
 * K = dh_response^dh_random mod dh_prime (the shared DH secret), then
 * LST = base64(HMAC-SHA1(key=bytes(K), msg=bytes(prepend))). The
 * "apply sign-bit padding" step from IBKR's reference Python is
 * implemented here as its logical equivalent: prepend a 0x00 byte only
 * when the raw big-endian byte encoding of K would otherwise have its
 * top bit set (which is exactly when Python's bit-length-based check
 * fires) — see this function's own inline comment for why the two are
 * the same condition. */
export function deriveLiveSessionToken(args: DeriveLiveSessionTokenArgs): string {
  const dhResponse = BigInt(`0x${args.dhResponseHex}`);
  const sharedSecret = modPow(dhResponse, args.dhRandom, args.dhPrime);

  let hex = bigintToHex(sharedSecret);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  let keyBytes = Buffer.from(hex, "hex");
  // Sign-bit padding: a leading byte with its top bit set is exactly the
  // case where Python's `bit_length(K) % 8 == 0` check fires (K's most
  // significant bit occupies the top bit of the first byte, with no
  // padding bits above it) — prepending 0x00 there guarantees any
  // implementation that treats this as a signed big-endian integer
  // (e.g. Java's BigInteger) reads the same positive value IBKR's server
  // does.
  if (keyBytes.length > 0 && (keyBytes[0] & 0x80) !== 0) {
    keyBytes = Buffer.concat([Buffer.from([0]), keyBytes]);
  }

  const prependBytes = Buffer.from(args.prependHex, "hex");
  const digest = createHmac("sha1", keyBytes).update(prependBytes).digest();
  return digest.toString("base64");
}

/** Step 4 (verify) — ibkrcampus.com .../lst/validate-live-session-token:
 * a SEPARATE HMAC-SHA1 (keyed by the just-computed LST itself, over the
 * consumer key) whose hex digest must equal IBKR's own
 * `live_session_token_signature`. This is the mandatory trust gate — a
 * mismatch means the derivation is wrong somewhere and `computedLst`
 * must never be used for a real API call. Constant-time comparison since
 * this is a security-relevant check, even though `lstSignatureHex` isn't
 * itself secret. */
export function verifyLiveSessionToken(computedLstBase64: string, consumerKey: string, lstSignatureHex: string): boolean {
  const key = Buffer.from(computedLstBase64, "base64");
  const expectedHex = createHmac("sha1", key).update(consumerKey, "utf8").digest("hex");

  const expected = Buffer.from(expectedHex, "utf8");
  const actual = Buffer.from(lstSignatureHex, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
