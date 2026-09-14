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

export type InteractiveBrokersConnectionDTO = {
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
};

function toDTO(row: {
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt: Date | null;
}): InteractiveBrokersConnectionDTO {
  return {
    status: row.status as InteractiveBrokersConnectionDTO["status"],
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
  return {
    accessToken: decrypt(row.encryptedApiKey),
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
