import "server-only";
import { prisma } from "@/server/db/prisma";
import { encrypt, decrypt } from "@/server/security/encryption";
import { trading212Provider } from "@/server/trading212/trading212-provider";

const PROVIDER = "trading212";

export type Trading212ConnectionDTO = {
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  syncStatus: "NEVER_SYNCED" | "SYNCING" | "SYNCED" | "FAILED";
  syncError: string | null;
  /** Phase 5 — distinct from lastSyncAt (last SUCCESSFUL sync): the
   * timestamp of the most recent FAILED attempt, for the connection-
   * health UI (Requirement 6/13). Null if the connection has never had a
   * failed sync. */
  lastFailedSyncAt: string | null;
};

export type ConnectTrading212Result =
  | { status: "connected"; connection: Trading212ConnectionDTO }
  | { status: "invalid_credentials"; message: string }
  | { status: "error"; message: string };

function toDTO(row: {
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt: Date | null;
  lastSyncAt: Date | null;
  syncStatus: string;
  syncError: string | null;
  lastFailedSyncAt: Date | null;
}): Trading212ConnectionDTO {
  return {
    status: row.status as Trading212ConnectionDTO["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastConnectedAt: row.lastConnectedAt ? row.lastConnectedAt.toISOString() : null,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    syncStatus: row.syncStatus as Trading212ConnectionDTO["syncStatus"],
    syncError: row.syncError,
    lastFailedSyncAt: row.lastFailedSyncAt ? row.lastFailedSyncAt.toISOString() : null,
  };
}

/** Never returns encryptedApiKey/encryptedApiSecret — this is the only
 * read path the API layer uses, so there is no code path by which a
 * stored credential (even encrypted) reaches a client response. */
export async function getTrading212Connection(userId: string): Promise<Trading212ConnectionDTO | null> {
  const row = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  return row ? toDTO(row) : null;
}

/** Validates real, caller-supplied credentials against Trading 212's own
 * API BEFORE ever touching storage — an invalid credential is never
 * persisted, matching "only mark the connection as Connected after
 * successful API validation" exactly. Upserts on [userId, provider] —
 * Phase 1 supports exactly one Trading 212 connection per user, so
 * reconnecting (e.g. after rotating a key) replaces the stored
 * credential rather than creating a second row. */
export async function connectTrading212(
  userId: string,
  apiKey: string,
  apiSecret: string
): Promise<ConnectTrading212Result> {
  const validation = await trading212Provider.validateCredentials({ apiKey, apiSecret });
  if (!validation.ok) {
    // Never surface validation.message verbatim if it could ever carry a
    // raw upstream response — trading212-client.ts already keeps these
    // generic, but re-asserting a fixed, safe message per reason here
    // means this repository's own contract doesn't silently change if
    // that ever drifts.
    const message =
      validation.reason === "unauthorized"
        ? "Trading 212 rejected these credentials — double-check your API Key and API Secret."
        : validation.reason === "rate_limited"
          ? "Trading 212 is rate-limiting requests right now — try again shortly."
          : "Couldn't verify these credentials with Trading 212 — try again shortly.";
    return { status: "invalid_credentials", message };
  }

  const now = new Date();
  const row = await prisma.brokerageConnection.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    create: {
      userId,
      provider: PROVIDER,
      encryptedApiKey: encrypt(apiKey),
      encryptedApiSecret: encrypt(apiSecret),
      externalAccountId: validation.externalAccountId,
      status: "CONNECTED",
      lastConnectedAt: now,
    },
    update: {
      encryptedApiKey: encrypt(apiKey),
      encryptedApiSecret: encrypt(apiSecret),
      externalAccountId: validation.externalAccountId,
      status: "CONNECTED",
      lastConnectedAt: now,
    },
  });

  return { status: "connected", connection: toDTO(row) };
}

/** Deletes the stored (encrypted) credentials entirely — "revoke/delete
 * credentials from CompassFinance storage" per the product requirement.
 * This never calls Trading 212 itself: there's no remote "revoke" action
 * to take, since these are the user's own account credentials, not a
 * delegated/OAuth grant this app could revoke on their behalf. A no-op
 * (not an error) when nothing is connected, so this is safe to call
 * defensively. */
export async function disconnectTrading212(userId: string): Promise<void> {
  await prisma.brokerageConnection.deleteMany({
    where: { userId, provider: PROVIDER },
  });
}

/** Decrypts the stored credential pair for `userId` — the ONE function in
 * this repository that ever reconstructs plaintext. Not called anywhere
 * in Phase 1 (there is no sync/read-portfolio-data call yet); exists now
 * because a future sync phase needs it and it belongs next to encrypt()
 * in the same repository that owns these rows, not bolted on later.
 * Never exposed through any API route — importing this into a client
 * component is impossible anyway ("server-only"), but this is also never
 * wired into a route handler's response in the first place. */
export async function getDecryptedTrading212Credentials(
  userId: string
): Promise<{ apiKey: string; apiSecret: string } | null> {
  const row = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!row) return null;
  return {
    apiKey: decrypt(row.encryptedApiKey),
    apiSecret: decrypt(row.encryptedApiSecret),
  };
}
