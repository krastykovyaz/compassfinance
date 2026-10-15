import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = {
  id: string;
  userId: string;
  provider: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  externalAccountId: string | null;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt: Date | null;
};

const store = new Map<string, Row>(); // keyed by `${userId}::${provider}`
const key = (userId: string, provider: string) => `${userId}::${provider}`;
let nextId = 1;

const prismaMock = {
  brokerageConnection: {
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { userId_provider: { userId: string; provider: string } };
        create: Omit<Row, "id" | "createdAt" | "updatedAt">;
        update: Partial<Row>;
      }) => {
        const { userId, provider } = where.userId_provider;
        const k = key(userId, provider);
        const existing = store.get(k);
        const now = new Date();
        const row: Row = existing
          ? { ...existing, ...update, updatedAt: now }
          : { id: `conn-${nextId++}`, createdAt: now, updatedAt: now, ...create };
        store.set(k, row);
        return row;
      }
    ),
    findUnique: vi.fn(async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) => {
      const { userId, provider } = where.userId_provider;
      return store.get(key(userId, provider)) ?? null;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { userId: string; provider: string } }) => {
      const k = key(where.userId, where.provider);
      const existed = store.has(k);
      store.delete(k);
      return { count: existed ? 1 : 0 };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { userId: string; provider: string }; data: Partial<Row> }) => {
      const k = key(where.userId, where.provider);
      const existing = store.get(k);
      if (!existing) return { count: 0 };
      store.set(k, { ...existing, ...data, updatedAt: new Date() });
      return { count: 1 };
    }),
  },
};

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    brokerageConnection: {
      upsert: (...args: unknown[]) => prismaMock.brokerageConnection.upsert(...(args as [never])),
      findUnique: (...args: unknown[]) => prismaMock.brokerageConnection.findUnique(...(args as [never])),
      deleteMany: (...args: unknown[]) => prismaMock.brokerageConnection.deleteMany(...(args as [never])),
      updateMany: (...args: unknown[]) => prismaMock.brokerageConnection.updateMany(...(args as [never])),
    },
  },
}));

import {
  completeInteractiveBrokersOAuthConnection,
  connectInteractiveBrokersFlex,
  disconnectInteractiveBrokers,
  getDecryptedInteractiveBrokersCredentials,
  getDecryptedInteractiveBrokersFlexCredentials,
  getInteractiveBrokersConnection,
  setInteractiveBrokersSelectedAccount,
} from "./interactive-brokers-repository";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

beforeEach(() => {
  store.clear();
  nextId = 1;
  vi.clearAllMocks();
  process.env.CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  else process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
});

describe("completeInteractiveBrokersOAuthConnection", () => {
  it("persists a CONNECTED row with provider INTERACTIVE_BROKERS", async () => {
    const result = await completeInteractiveBrokersOAuthConnection("user-1", "access-token", "access-token-secret");

    expect(result.status).toBe("CONNECTED");
    const row = store.get("user-1::INTERACTIVE_BROKERS");
    expect(row).toBeDefined();
    expect(row!.provider).toBe("INTERACTIVE_BROKERS");
  });

  it("stores the access token and secret encrypted, never as plaintext", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "my-access-token", "my-access-token-secret");

    const row = store.get("user-1::INTERACTIVE_BROKERS");
    expect(row!.encryptedApiKey).not.toBe("my-access-token");
    expect(row!.encryptedApiKey).not.toContain("my-access-token");
    expect(row!.encryptedApiSecret).not.toBe("my-access-token-secret");
    expect(row!.encryptedApiSecret).not.toContain("my-access-token-secret");
  });

  it("leaves externalAccountId null — Phase 1 never calls /portfolio/accounts, so there is no real account id yet", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "token", "secret");

    const row = store.get("user-1::INTERACTIVE_BROKERS");
    expect(row!.externalAccountId).toBeNull();
  });

  it("never sets any sync-metadata field — a successful OAuth connection is not a sync", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "token", "secret");

    const row = store.get("user-1::INTERACTIVE_BROKERS");
    expect(row).not.toHaveProperty("lastSyncAt");
    expect(row).not.toHaveProperty("syncStartedAt");
    expect(row).not.toHaveProperty("lastFailedSyncAt");
  });

  it("reconnecting the same user replaces the stored OAuth credentials rather than creating a second row", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "token-1", "secret-1");
    await completeInteractiveBrokersOAuthConnection("user-1", "token-2", "secret-2");

    const creds = await getDecryptedInteractiveBrokersCredentials("user-1");
    expect(creds).toEqual({ accessToken: "token-2", accessTokenSecret: "secret-2" });
  });

  it("never creates or touches a Trading 212 (or any other provider) row for the same user", async () => {
    store.set("user-1::trading212", {
      id: "conn-trading212",
      userId: "user-1",
      provider: "trading212",
      encryptedApiKey: "enc-key",
      encryptedApiSecret: "enc-secret",
      externalAccountId: "12345",
      status: "CONNECTED",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastConnectedAt: new Date(),
    });

    await completeInteractiveBrokersOAuthConnection("user-1", "token", "secret");

    const trading212Row = store.get("user-1::trading212");
    expect(trading212Row!.externalAccountId).toBe("12345");
    expect(trading212Row!.encryptedApiKey).toBe("enc-key");
  });
});

describe("getInteractiveBrokersConnection — never returns credential fields, always scoped to the caller", () => {
  it("returns null when nothing is connected", async () => {
    expect(await getInteractiveBrokersConnection("user-1")).toBeNull();
  });

  it("returns only status/timestamp metadata — no encryptedApiKey/encryptedApiSecret/externalAccountId in the DTO", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "token", "secret");

    const connection = await getInteractiveBrokersConnection("user-1");
    expect(connection).not.toBeNull();
    expect(connection).not.toHaveProperty("encryptedApiKey");
    expect(connection).not.toHaveProperty("encryptedApiSecret");
    expect(connection).not.toHaveProperty("accessToken");
    expect(connection).not.toHaveProperty("accessTokenSecret");
    expect(connection).not.toHaveProperty("externalAccountId");
    expect(Object.keys(connection!).sort()).toEqual(["createdAt", "lastConnectedAt", "method", "status", "updatedAt"].sort());
  });

  it("user A cannot see user B's connection", async () => {
    await completeInteractiveBrokersOAuthConnection("user-a", "token-a", "secret-a");

    expect(await getInteractiveBrokersConnection("user-b")).toBeNull();
  });
});

describe("disconnectInteractiveBrokers", () => {
  it("deletes the stored connection entirely", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "token", "secret");
    expect(await getInteractiveBrokersConnection("user-1")).not.toBeNull();

    await disconnectInteractiveBrokers("user-1");

    expect(await getInteractiveBrokersConnection("user-1")).toBeNull();
  });

  it("is a safe no-op when nothing is connected", async () => {
    await expect(disconnectInteractiveBrokers("user-1")).resolves.toBeUndefined();
  });

  it("never affects a different user's connection", async () => {
    await completeInteractiveBrokersOAuthConnection("user-a", "token-a", "secret-a");
    await completeInteractiveBrokersOAuthConnection("user-b", "token-b", "secret-b");

    await disconnectInteractiveBrokers("user-a");

    expect(await getInteractiveBrokersConnection("user-a")).toBeNull();
    expect(await getInteractiveBrokersConnection("user-b")).not.toBeNull();
  });

  it("never affects a Trading 212 connection for the same user", async () => {
    store.set("user-1::trading212", {
      id: "conn-trading212",
      userId: "user-1",
      provider: "trading212",
      encryptedApiKey: "enc-key",
      encryptedApiSecret: "enc-secret",
      externalAccountId: "12345",
      status: "CONNECTED",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastConnectedAt: new Date(),
    });
    await completeInteractiveBrokersOAuthConnection("user-1", "token", "secret");

    await disconnectInteractiveBrokers("user-1");

    expect(store.get("user-1::trading212")).toBeDefined();
  });
});

describe("setInteractiveBrokersSelectedAccount", () => {
  it("persists the discovered account id onto the existing connection row", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "token", "secret");

    await setInteractiveBrokersSelectedAccount("user-1", "U1234567");

    const row = store.get("user-1::INTERACTIVE_BROKERS");
    expect(row!.externalAccountId).toBe("U1234567");
  });

  it("never affects a different user's connection", async () => {
    await completeInteractiveBrokersOAuthConnection("user-a", "token-a", "secret-a");
    await completeInteractiveBrokersOAuthConnection("user-b", "token-b", "secret-b");

    await setInteractiveBrokersSelectedAccount("user-a", "U1111111");

    expect(store.get("user-a::INTERACTIVE_BROKERS")!.externalAccountId).toBe("U1111111");
    expect(store.get("user-b::INTERACTIVE_BROKERS")!.externalAccountId).toBeNull();
  });

  it("is a safe no-op when the user has no Interactive Brokers connection", async () => {
    await expect(setInteractiveBrokersSelectedAccount("user-1", "U1234567")).resolves.toBeUndefined();
  });
});

describe("getDecryptedInteractiveBrokersCredentials", () => {
  it("round-trips the original plaintext access token/secret for the owning user", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "real-access-token", "real-access-token-secret");

    expect(await getDecryptedInteractiveBrokersCredentials("user-1")).toEqual({
      accessToken: "real-access-token",
      accessTokenSecret: "real-access-token-secret",
    });
  });

  it("returns null for a user with no connection", async () => {
    expect(await getDecryptedInteractiveBrokersCredentials("user-1")).toBeNull();
  });
});

describe("Flex connection (the personal-account route)", () => {
  it("stores a CONNECTED row with the token and query id encrypted, never as plaintext", async () => {
    await connectInteractiveBrokersFlex("user-1", { token: "FLEXSECRETTOKEN99", queryId: "424242" });

    const row = store.get(key("user-1", "INTERACTIVE_BROKERS"))!;
    expect(row.status).toBe("CONNECTED");
    expect(row.encryptedApiKey).not.toContain("FLEXSECRETTOKEN99");
    expect(row.encryptedApiKey).not.toContain("424242");
    expect(row.encryptedApiSecret).not.toContain("flex");
  });

  it("round-trips the token and query id for the owning user", async () => {
    await connectInteractiveBrokersFlex("user-1", { token: "FLEXSECRETTOKEN99", queryId: "424242" });

    expect(await getDecryptedInteractiveBrokersFlexCredentials("user-1")).toEqual({ token: "FLEXSECRETTOKEN99", queryId: "424242" });
  });

  it("is not an OAuth connection: its stored value must never be handed to the OAuth endpoints as an Access Token", async () => {
    await connectInteractiveBrokersFlex("user-1", { token: "FLEXSECRETTOKEN99", queryId: "424242" });

    expect(await getDecryptedInteractiveBrokersCredentials("user-1")).toBeNull();
  });

  it("has no Flex credentials for an OAuth connection or for nobody", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "real-access-token", "real-access-token-secret");

    expect(await getDecryptedInteractiveBrokersFlexCredentials("user-1")).toBeNull();
    expect(await getDecryptedInteractiveBrokersFlexCredentials("nobody")).toBeNull();
  });

  it("reports how the account was connected, without exposing any credential", async () => {
    await connectInteractiveBrokersFlex("user-1", { token: "FLEXSECRETTOKEN99", queryId: "424242" });
    await completeInteractiveBrokersOAuthConnection("user-2", "real-access-token", "real-access-token-secret");

    expect((await getInteractiveBrokersConnection("user-1"))?.method).toBe("flex");
    expect((await getInteractiveBrokersConnection("user-2"))?.method).toBe("oauth");
    expect(JSON.stringify(await getInteractiveBrokersConnection("user-1"))).not.toContain("FLEXSECRETTOKEN99");
  });

  it("connecting this way replaces an earlier connection of the other kind (one IBKR connection per user) and clears the account id", async () => {
    await completeInteractiveBrokersOAuthConnection("user-1", "real-access-token", "real-access-token-secret");
    await setInteractiveBrokersSelectedAccount("user-1", "U111");

    await connectInteractiveBrokersFlex("user-1", { token: "FLEXSECRETTOKEN99", queryId: "424242" });

    expect(store.size).toBe(1);
    expect(store.get(key("user-1", "INTERACTIVE_BROKERS"))!.externalAccountId).toBeNull();
    expect((await getInteractiveBrokersConnection("user-1"))?.method).toBe("flex");
  });

  it("never touches another user's connection", async () => {
    await completeInteractiveBrokersOAuthConnection("user-2", "other-token", "other-secret");

    await connectInteractiveBrokersFlex("user-1", { token: "FLEXSECRETTOKEN99", queryId: "424242" });

    expect(await getDecryptedInteractiveBrokersCredentials("user-2")).toEqual({ accessToken: "other-token", accessTokenSecret: "other-secret" });
  });
});
