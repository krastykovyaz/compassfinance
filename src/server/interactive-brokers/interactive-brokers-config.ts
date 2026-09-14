import "server-only";

// Interactive Brokers Phase 1 — connection-only. Two application-level
// secrets, issued ONCE to CompassFinance by IBKR at vendor onboarding (not
// per-user, unlike Trading 212's per-user API key/secret) — see
// docs/integrations/interactive-brokers-phase-0.md §13:
//   - IBKR_CONSUMER_KEY: issued after IBKR Compliance approval.
//   - IBKR_RSA_PRIVATE_KEY: the private half of the RSA keypair
//     CompassFinance generates and registers the public half of with IBKR
//     (used to RSA-SHA256-sign every OAuth 1.0a request — IBKR's docs
//     state only RSA-SHA256 is supported, not PLAINTEXT). Stored as a PEM
//     string with literal "\n" escapes (the standard way to fit a
//     multi-line PEM into a single-line env var) — unescaped on read.
//
// Deliberately absent from this config: any Diffie-Hellman prime/
// generator, since Phase 1 never computes a Live Session Token (LST
// computation is explicitly deferred — see the repository's own header
// comment) and so has no use for it yet. Adding it now would be an env
// var nothing reads, which Milestone instructions explicitly ask to avoid
// ("only what's actually required").
//
// Never crashes at import time when unset — getInteractiveBrokersConfig()
// returns null, and every caller (the OAuth routes) treats that as "IBKR
// isn't configured yet" and fails the request cleanly instead of taking
// the app down. This matters because IBKR Compliance approval, the
// consumer key, and the RSA key material are all external blockers (see
// docs/integrations/interactive-brokers-phase-0.md §17) that can easily
// still be missing in any given environment, including production, for a
// long time after this code ships.

const DEFAULT_API_BASE_URL = "https://api.ibkr.com/v1/api";
const DEFAULT_AUTHORIZE_BASE_URL = "https://interactivebrokers.com/authorize";

export type InteractiveBrokersConfig = {
  consumerKey: string;
  privateKeyPem: string;
};

export function getInteractiveBrokersConfig(): InteractiveBrokersConfig | null {
  const consumerKey = process.env.IBKR_CONSUMER_KEY;
  const rawPrivateKey = process.env.IBKR_RSA_PRIVATE_KEY;
  if (!consumerKey || !rawPrivateKey) return null;
  return {
    consumerKey,
    privateKeyPem: rawPrivateKey.replace(/\\n/g, "\n"),
  };
}

export function getInteractiveBrokersApiBaseUrl(): string {
  return process.env.IBKR_API_BASE_URL || DEFAULT_API_BASE_URL;
}

export function getInteractiveBrokersAuthorizeBaseUrl(): string {
  return process.env.IBKR_AUTHORIZE_BASE_URL || DEFAULT_AUTHORIZE_BASE_URL;
}

// ---------------------------------------------------------------------------
// Phase 2 — portfolio sync additions. Calling /portfolio/* requires a Live
// Session Token (LST), which in turn requires TWO more pieces of
// application-level config beyond Phase 1's consumer key + signing key —
// confirmed directly from IBKR's own OAuth 1.0a LST documentation
// (ibkrcampus.com/docs/web-api/authentication/oauth-1a/lst/...), which
// Phase 0/1 did not need to go this deep into:
//
//   - IBKR_RSA_ENCRYPTION_PRIVATE_KEY: a SECOND, DISTINCT RSA private key
//     from IBKR_RSA_PRIVATE_KEY. IBKR's LST derivation docs explicitly
//     name two different keys — a "signature_key" (used throughout OAuth
//     for RSA-SHA256 request signing — this is IBKR_RSA_PRIVATE_KEY,
//     unchanged from Phase 1) and a separate "encryption_key" (used only
//     to PKCS#1 v1.5-decrypt the Access Token Secret when deriving the
//     LST). CompassFinance registers both public halves with IBKR at
//     onboarding, same as the signing key. Same "\n"-escaped PEM format.
//   - IBKR_DH_PRIME: the Diffie-Hellman group prime IBKR issues per
//     consumer key at registration (hex string, no "0x" prefix). The DH
//     generator is NOT configurable — IBKR fixes it at 2 for every
//     consumer key (see interactive-brokers-live-session-token.ts).
//
// Same "never crashes when absent" contract as getInteractiveBrokersConfig
// above: getInteractiveBrokersSyncConfig() returns null until all of
// these — plus the Phase 1 config — are set, and every Phase 2 sync path
// treats that as "not configured yet," not a crash.

export type InteractiveBrokersSyncConfig = InteractiveBrokersConfig & {
  encryptionKeyPem: string;
  dhPrime: bigint;
};

const DH_GENERATOR = BigInt(2);

export function getInteractiveBrokersDhGenerator(): bigint {
  return DH_GENERATOR;
}

export function getInteractiveBrokersRealm(): string {
  // "For TESTCONS, use test_realm. For all other consumer keys, use
  // limited_poa" — limited_poa is the correct default for a real,
  // Compliance-approved third-party consumer key; only a TESTCONS
  // sandbox key (if IBKR ever issues CompassFinance one) needs the
  // override.
  return process.env.IBKR_REALM || "limited_poa";
}

export function getInteractiveBrokersSyncConfig(): InteractiveBrokersSyncConfig | null {
  const base = getInteractiveBrokersConfig();
  const rawEncryptionKey = process.env.IBKR_RSA_ENCRYPTION_PRIVATE_KEY;
  const rawDhPrime = process.env.IBKR_DH_PRIME;
  if (!base || !rawEncryptionKey || !rawDhPrime) return null;

  let dhPrime: bigint;
  try {
    dhPrime = BigInt(`0x${rawDhPrime}`);
  } catch {
    return null;
  }

  return {
    ...base,
    encryptionKeyPem: rawEncryptionKey.replace(/\\n/g, "\n"),
    dhPrime,
  };
}
