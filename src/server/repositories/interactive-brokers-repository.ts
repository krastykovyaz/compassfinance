import "server-only";
import { prisma } from "@/server/db/prisma";
import { encrypt, decrypt } from "@/server/security/encryption";

// Interactive Brokers — Phase 1 established the OAuth connection lifecycle
// (this file originally never touched syncStatus/lastSyncAt/
// lastFailedSyncAt/syncStartedAt at all — a successful OAuth handshake is
// a connection, not a sync). Phase 2 adds real portfolio sync — see
// interactive-brokers-sync.ts, the only caller of the sync-metadata writes
// that now live there, and setInteractiveBrokersSelectedAccount below,
// which Phase 2 needed to persist account discovery's result onto the
// existing connection row (see docs/integrations/interactive-brokers-
// phase-0.md's "Phase 2 implementation" section).

const PROVIDER = "INTERACTIVE_BROKERS";

// A connection to Interactive Brokers can be made two ways, and both live in
// the same row (one IBKR connection per user):
//   "oauth" - the vendor OAuth 1.0a flow. encryptedApiKey/encryptedApiSecret
//             hold the Access Token and Access Token Secret as plain strings.
//   "flex"  - the personal-account route: a Flex Web Service token plus the
//             Flex Query ID the user created. encryptedApiKey holds a small
//             tagged JSON envelope, so the two kinds can never be confused
//             and the database layout does not change. encryptedApiSecret
//             holds a constant placeholder (the column is not nullable).
export type InteractiveBrokersConnectionMethod = "oauth" | "flex";

type FlexEnvelope = { v: 1; kind: "flex"; token: string; queryId: string };

const FLEX_SECRET_PLACEHOLDER = "flex-report-token";

function readFlexEnvelope(plaintextApiKey: string): FlexEnvelope | null {
  if (!plaintextApiKey.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(plaintextApiKey) as Partial<FlexEnvelope>;
    if (parsed.v === 1 && parsed.kind === "flex" && typeof parsed.token === "string" && typeof parsed.queryId === "string") {
      return parsed as FlexEnvelope;
    }
  } catch {
    // Not an envelope: an ordinary OAuth Access Token.
  }
  return null;
}

function methodOf(encryptedApiKey: string): InteractiveBrokersConnectionMethod {
  try {
    return readFlexEnvelope(decrypt(encryptedApiKey)) ? "flex" : "oauth";
  } catch {
    // An undecryptable value (for example after an encryption-key change)
    // is reported as the default; syncing it will fail with its own error.
    return "oauth";
  }
}

export type InteractiveBrokersConnectionDTO = {
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  method: InteractiveBrokersConnectionMethod;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
};

function toDTO(row: {
  status: string;
  encryptedApiKey: string;
  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt: Date | null;
}): InteractiveBrokersConnectionDTO {
  return {
    status: row.status as InteractiveBrokersConnectionDTO["status"],
    method: methodOf(row.encryptedApiKey),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastConnectedAt: row.lastConnectedAt ? row.lastConnectedAt.toISOString() : null,
  };
}

/** Never returns encryptedApiKey/encryptedApiSecret — the only read path
 * the API layer uses, mirroring getTrading212Connection's exact
 * guarantee. */
export async function getInteractiveBrokersConnection(userId: string): Promise<InteractiveBrokersConnectionDTO | null> {
  const row = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  return row ? toDTO(row) : null;
}

/** Called ONLY from the OAuth callback route, and only after a real,
 * successful access-token exchange with Interactive Brokers — this
 * function itself never talks to IBKR or validates anything; the caller
 * already did (see the callback route, which also already verified the
 * signed state cookie and that the callback's session matches the user
 * who started the flow).
 *
 * Upserts on [userId, provider] — same one-connection-per-user-per-
 * provider behavior as Trading 212's connectTrading212, so reconnecting
 * (e.g. after revoking and re-authorizing on IBKR's side) replaces the
 * stored OAuth credentials rather than creating a second row.
 *
 * externalAccountId is intentionally left null on create and untouched on
 * update: Phase 1 never calls GET /portfolio/accounts (that's portfolio
 * sync — explicitly out of scope, see the IMPLEMENTATION LIMITS in the
 * Phase 1 task), so there is no real IBKR account id to store yet. This is
 * exactly why BrokerageConnection.externalAccountId was made nullable
 * (see the schema's own comment on that field).
 *
 * syncStatus/lastSyncAt/lastFailedSyncAt/syncStartedAt are never written
 * here at all — a successful OAuth handshake is a connection, not a sync,
 * and must never be represented as one. */
export async function completeInteractiveBrokersOAuthConnection(
  userId: string,
  accessToken: string,
  accessTokenSecret: string
): Promise<InteractiveBrokersConnectionDTO> {
  const now = new Date();
  const row = await prisma.brokerageConnection.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    create: {
      userId,
      provider: PROVIDER,
      encryptedApiKey: encrypt(accessToken),
      encryptedApiSecret: encrypt(accessTokenSecret),
      externalAccountId: null,
      status: "CONNECTED",
      lastConnectedAt: now,
    },
    update: {
      encryptedApiKey: encrypt(accessToken),
      encryptedApiSecret: encrypt(accessTokenSecret),
      status: "CONNECTED",
      lastConnectedAt: now,
    },
  });
  return toDTO(row);
}

/** Stores a Flex token and query ID after the caller has checked them with
 * Interactive Brokers (see the Flex connect route). Same one-row-per-user
 * upsert as the OAuth connection: connecting this way replaces an earlier
 * OAuth connection, and the other way round. The account id is cleared
 * because it is learned again from the first report. */
export async function connectInteractiveBrokersFlex(
  userId: string,
  credentials: { token: string; queryId: string }
): Promise<InteractiveBrokersConnectionDTO> {
  const now = new Date();
  const envelope: FlexEnvelope = { v: 1, kind: "flex", token: credentials.token, queryId: credentials.queryId };
  const encryptedApiKey = encrypt(JSON.stringify(envelope));
  const encryptedApiSecret = encrypt(FLEX_SECRET_PLACEHOLDER);
  const row = await prisma.brokerageConnection.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    create: { userId, provider: PROVIDER, encryptedApiKey, encryptedApiSecret, externalAccountId: null, status: "CONNECTED", lastConnectedAt: now },
    update: { encryptedApiKey, encryptedApiSecret, externalAccountId: null, status: "CONNECTED", lastConnectedAt: now },
  });
  return toDTO(row);
}

/** The Flex token and query ID, or null when the user has no connection or
 * connected the OAuth way. Never exposed through an API route. */
export async function getDecryptedInteractiveBrokersFlexCredentials(
  userId: string
): Promise<{ token: string; queryId: string } | null> {
  const row = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!row) return null;
  const envelope = readFlexEnvelope(decrypt(row.encryptedApiKey));
  return envelope ? { token: envelope.token, queryId: envelope.queryId } : null;
}

/** Deletes the stored (encrypted) OAuth credentials entirely. This never
 * calls Interactive Brokers itself — the official OAuth 1.0a third-party
 * workflow (see docs/integrations/interactive-brokers-phase-0.md §3.I)
 * describes revocation as something the USER does from their own IBKR
 * account settings, not an API a third party calls on their behalf; no
 * IBKR endpoint for third-party-initiated token revocation was found
 * during Phase 0 research. Deleting the row makes the stored, encrypted
 * Access Token/Secret permanently unusable to CompassFinance (the only
 * side CompassFinance controls) — this must never be described to the
 * user as revoking access on IBKR's side too. A no-op (not an error) when
 * nothing is connected, same as disconnectTrading212. */
export async function disconnectInteractiveBrokers(userId: string): Promise<void> {
  await prisma.brokerageConnection.deleteMany({
    where: { userId, provider: PROVIDER },
  });
}

/** Decrypts the stored Access Token/Access Token Secret pair — the ONE
 * function in this repository that ever reconstructs plaintext. Not
 * called anywhere in Phase 1 (there is no sync/portfolio-read call yet);
 * exists now, next to encrypt()/decrypt() in the repository that owns
 * these rows, for the sync phase that will need it later. Never exposed
 * through any API route or to the Compass Agent. */
export async function getDecryptedInteractiveBrokersCredentials(
  userId: string
): Promise<{ accessToken: string; accessTokenSecret: string } | null> {
  const row = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!row) return null;
  const accessToken = decrypt(row.encryptedApiKey);
  // A Flex connection stores an envelope here, not an Access Token: it is
  // not an OAuth connection and must never be sent to the OAuth endpoints.
  if (readFlexEnvelope(accessToken)) return null;
  return {
    accessToken,
    accessTokenSecret: decrypt(row.encryptedApiSecret),
  };
}

/** Phase 2 — persists the real IBKR account id account discovery
 * resolved (see interactive-brokers-account-selection.ts), scoped by
 * userId+provider so it can never write to another user's connection.
 * Called from the sync engine once discovery/selection succeeds, and
 * from the account-selection API route once the user picks among
 * multiple discovered accounts (that route re-validates the chosen id
 * against a fresh discovery call first — this function itself trusts its
 * caller, same as every other write in this file). A no-op (not an
 * error) when the user has no IBKR connection at all. */
export async function setInteractiveBrokersSelectedAccount(userId: string, accountId: string): Promise<void> {
  await prisma.brokerageConnection.updateMany({
    where: { userId, provider: PROVIDER },
    data: { externalAccountId: accountId },
  });
}
