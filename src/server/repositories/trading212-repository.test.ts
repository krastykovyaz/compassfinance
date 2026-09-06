import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const validateCredentials = vi.fn();
vi.mock("@/server/trading212/trading212-provider", () => ({
  trading212Provider: {
    displayName: "Trading 212",
    providerId: "trading212",
    validateCredentials: (...args: unknown[]) => validateCredentials(...args),
  },
}));

type Row = {
  id: string;
  userId: string;
  provider: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  externalAccountId: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt: Date | null;
  lastSyncAt: Date | null;
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
  },
};

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    brokerageConnection: {
      upsert: (...args: unknown[]) => prismaMock.brokerageConnection.upsert(...(args as [never])),
      findUnique: (...args: unknown[]) => prismaMock.brokerageConnection.findUnique(...(args as [never])),
      deleteMany: (...args: unknown[]) => prismaMock.brokerageConnection.deleteMany(...(args as [never])),
    },
  },
}));

import {
  connectTrading212,
  disconnectTrading212,
  getDecryptedTrading212Credentials,
  getTrading212Connection,
} from "./trading212-repository";

const TEST_KEY = Buffer.alloc(32, 3).toString("base64");
const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

beforeEach(() => {
  store.clear();
  nextId = 1;
  vi.clearAllMocks();
  process.env.CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;
  validateCredentials.mockResolvedValue({ ok: true, externalAccountId: "12345678" });
});

afterEach(() => {
  // Assigning `undefined` to a process.env key stores the literal string
  // "undefined" instead of deleting it — delete outright when there was
  // nothing to restore.
  if (originalKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  else process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
});

describe("connectTrading212", () => {
  it("only persists a connection after real API validation succeeds", async () => {
    const result = await connectTrading212("user-1", "key-abc", "secret-xyz");

    expect(result.status).toBe("connected");
    expect(validateCredentials).toHaveBeenCalledWith({ apiKey: "key-abc", apiSecret: "secret-xyz" });
    const connection = await getTrading212Connection("user-1");
    expect(connection?.status).toBe("CONNECTED");
  });

  it("never persists a connection when validation fails — an unusable connection is never stored", async () => {
    validateCredentials.mockResolvedValue({ ok: false, reason: "unauthorized", message: "nope" });

    const result = await connectTrading212("user-1", "bad-key", "bad-secret");

    expect(result.status).toBe("invalid_credentials");
    expect(await getTrading212Connection("user-1")).toBeNull();
  });

  it("returns a safe, fixed message for invalid credentials — never the raw upstream error text", async () => {
    validateCredentials.mockResolvedValue({ ok: false, reason: "unauthorized", message: "raw upstream secret-leaking text" });

    const result = await connectTrading212("user-1", "bad-key", "bad-secret");

    expect(result.status).toBe("invalid_credentials");
    if (result.status === "invalid_credentials") {
      expect(result.message).not.toContain("raw upstream secret-leaking text");
    }
  });

  it("stores credentials encrypted, never as plaintext", async () => {
    await connectTrading212("user-1", "my-plaintext-key", "my-plaintext-secret");

    const row = store.get("user-1::trading212");
    expect(row).toBeDefined();
    expect(row!.encryptedApiKey).not.toBe("my-plaintext-key");
    expect(row!.encryptedApiKey).not.toContain("my-plaintext-key");
    expect(row!.encryptedApiSecret).not.toBe("my-plaintext-secret");
    expect(row!.encryptedApiSecret).not.toContain("my-plaintext-secret");
  });

  it("reconnecting the same user replaces the credential rather than creating a second row", async () => {
    await connectTrading212("user-1", "key-1", "secret-1");
    await connectTrading212("user-1", "key-2", "secret-2");

    const creds = await getDecryptedTrading212Credentials("user-1");
    expect(creds).toEqual({ apiKey: "key-2", apiSecret: "secret-2" });
  });
});

describe("getTrading212Connection — never returns credential fields, always scoped to the caller", () => {
  it("returns null when nothing is connected", async () => {
    expect(await getTrading212Connection("user-1")).toBeNull();
  });

  it("returns only status/timestamp metadata — no encryptedApiKey/encryptedApiSecret/externalAccountId in the DTO", async () => {
    await connectTrading212("user-1", "key-abc", "secret-xyz");

    const connection = await getTrading212Connection("user-1");
    expect(connection).not.toBeNull();
    expect(connection).not.toHaveProperty("encryptedApiKey");
    expect(connection).not.toHaveProperty("encryptedApiSecret");
    expect(connection).not.toHaveProperty("apiKey");
    expect(connection).not.toHaveProperty("apiSecret");
    expect(Object.keys(connection!).sort()).toEqual(
      ["createdAt", "lastConnectedAt", "lastSyncAt", "status", "updatedAt"].sort()
    );
  });

  it("user A cannot see user B's connection", async () => {
    await connectTrading212("user-a", "key-a", "secret-a");

    expect(await getTrading212Connection("user-b")).toBeNull();
  });
});

describe("disconnectTrading212", () => {
  it("deletes the stored connection entirely", async () => {
    await connectTrading212("user-1", "key-abc", "secret-xyz");
    expect(await getTrading212Connection("user-1")).not.toBeNull();

    await disconnectTrading212("user-1");

    expect(await getTrading212Connection("user-1")).toBeNull();
  });

  it("is a safe no-op when nothing is connected", async () => {
    await expect(disconnectTrading212("user-1")).resolves.toBeUndefined();
  });

  it("never affects a different user's connection", async () => {
    await connectTrading212("user-a", "key-a", "secret-a");
    await connectTrading212("user-b", "key-b", "secret-b");

    await disconnectTrading212("user-a");

    expect(await getTrading212Connection("user-a")).toBeNull();
    expect(await getTrading212Connection("user-b")).not.toBeNull();
  });
});

describe("getDecryptedTrading212Credentials", () => {
  it("round-trips the original plaintext credentials for the owning user", async () => {
    await connectTrading212("user-1", "real-key", "real-secret");

    expect(await getDecryptedTrading212Credentials("user-1")).toEqual({
      apiKey: "real-key",
      apiSecret: "real-secret",
    });
  });

  it("returns null for a user with no connection", async () => {
    expect(await getDecryptedTrading212Credentials("user-1")).toBeNull();
  });
});
