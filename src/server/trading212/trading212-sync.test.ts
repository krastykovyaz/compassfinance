import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getDecryptedTrading212Credentials = vi.fn();
vi.mock("@/server/repositories/trading212-repository", () => ({
  getDecryptedTrading212Credentials: (...args: unknown[]) => getDecryptedTrading212Credentials(...args),
}));

const getAccountSummary = vi.fn();
const getPositions = vi.fn();
const getOrderHistoryPage = vi.fn();
const getDividendsPage = vi.fn();
const getTransactionsPage = vi.fn();
vi.mock("./trading212-provider", () => ({
  trading212Provider: {
    displayName: "Trading 212",
    providerId: "trading212",
    getAccountSummary: (...args: unknown[]) => getAccountSummary(...args),
    getPositions: (...args: unknown[]) => getPositions(...args),
    getOrderHistoryPage: (...args: unknown[]) => getOrderHistoryPage(...args),
    getDividendsPage: (...args: unknown[]) => getDividendsPage(...args),
    getTransactionsPage: (...args: unknown[]) => getTransactionsPage(...args),
  },
}));

// ---------------------------------------------------------------------------
// In-memory Prisma double — same style established across the Trading 212
// test suite, extended with `updateMany` on the connection table (the
// atomic lock's own primitive — see trading212-sync.ts's acquireSyncLock)
// and a configurable stale-lock window for the recovery tests.
// ---------------------------------------------------------------------------

type AnyRow = Record<string, unknown>;

const { connectionRows, accountTable, positionTable, orderTable, activityTable, transactionTable, prismaMock, staleLockMs } =
  vi.hoisted(() => {
    function makeTable() {
      const rows = new Map<string, AnyRow>();
      return {
        rows,
        findUnique: async ({ where }: { where: AnyRow }) => {
          const compositeKey = Object.keys(where).find((k) => k.includes("_"));
          if (compositeKey) return rows.get(JSON.stringify(where[compositeKey])) ?? null;
          const id = where.brokerageConnectionId as string;
          return [...rows.values()].find((r) => r.brokerageConnectionId === id) ?? null;
        },
        findMany: async ({ where }: { where: AnyRow }) => {
          let result = [...rows.values()];
          if (where.brokerageConnectionId) result = result.filter((r) => r.brokerageConnectionId === where.brokerageConnectionId);
          if (where.userId) result = result.filter((r) => r.userId === where.userId);
          const externalIdIn = (where.externalId as { in?: string[] } | undefined)?.in;
          if (externalIdIn) result = result.filter((r) => externalIdIn.includes(r.externalId as string));
          return result;
        },
        upsert: async ({ where, create, update }: { where: AnyRow; create: AnyRow; update: AnyRow }) => {
          const compositeKey = Object.keys(where).find((k) => k.includes("_"));
          const k = compositeKey ? JSON.stringify(where[compositeKey]) : `id:${where.brokerageConnectionId}`;
          const existing = rows.get(k);
          const row = existing ? { ...existing, ...update } : { id: `row-${Math.random()}`, ...create };
          rows.set(k, row);
          return row;
        },
        deleteMany: async ({ where }: { where: AnyRow }) => {
          let deleted = 0;
          for (const [k, row] of rows) {
            if (where.brokerageConnectionId && row.brokerageConnectionId !== where.brokerageConnectionId) continue;
            const externalIdNotIn = (where.externalId as { notIn?: string[] } | undefined)?.notIn;
            if (externalIdNotIn && externalIdNotIn.includes(row.externalId as string)) continue;
            rows.delete(k);
            deleted++;
          }
          return { count: deleted };
        },
      };
    }

    const connectionRows = new Map<string, AnyRow>();
    const staleLockMs = { value: 10 * 60_000 };
    const accountTable = makeTable();
    const positionTable = makeTable();
    const orderTable = makeTable();
    const activityTable = makeTable();
    const transactionTable = makeTable();

    function matchesWhereOr(row: AnyRow, or: AnyRow[]): boolean {
      return or.some((clause) => {
        return Object.entries(clause).every(([field, cond]) => {
          const val = row[field];
          if (cond === null) return val === null;
          if (typeof cond === "object" && cond !== null) {
            const c = cond as { not?: unknown; lt?: Date };
            if ("not" in c) return val !== c.not;
            if ("lt" in c && c.lt instanceof Date) return val instanceof Date && val.getTime() < c.lt.getTime();
          }
          return val === cond;
        });
      });
    }

    const prismaMock = {
      brokerageConnection: {
        findUnique: async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) => {
          return connectionRows.get(where.userId_provider.userId) ?? null;
        },
        update: async ({ where, data }: { where: { id: string }; data: AnyRow }) => {
          const existing = [...connectionRows.values()].find((r) => r.id === where.id)!;
          Object.assign(existing, data);
          return existing;
        },
        // The atomic lock primitive itself — mirrors real Prisma/SQL
        // semantics closely enough for these tests: the WHERE clause
        // (including the OR) is evaluated against the CURRENT row state
        // before any write, and only a row that matches gets updated —
        // exactly the compare-and-swap acquireSyncLock relies on.
        updateMany: async ({ where, data }: { where: AnyRow; data: AnyRow }) => {
          const row = [...connectionRows.values()].find((r) => r.id === where.id);
          if (!row) return { count: 0 };
          const baseMatches = where.provider === undefined || row.provider === where.provider;
          const orMatches = where.OR ? matchesWhereOr(row, where.OR as AnyRow[]) : true;
          if (!baseMatches || !orMatches) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      },
      brokerageAccount: accountTable,
      brokeragePosition: positionTable,
      brokerageOrder: orderTable,
      brokerageActivity: activityTable,
      brokerageTransaction: transactionTable,
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };

    return { connectionRows, accountTable, positionTable, orderTable, activityTable, transactionTable, prismaMock, staleLockMs };
  });

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));

const getTrading212StaleLockMs = vi.fn(() => staleLockMs.value);
vi.mock("./trading212-sync-config", () => ({
  getTrading212StaleLockMs: () => getTrading212StaleLockMs(),
}));

import { syncTrading212 } from "./trading212-sync";

function seedConnection(userId: string, id = `conn-${userId}`, overrides: AnyRow = {}) {
  connectionRows.set(userId, {
    id,
    userId,
    provider: "trading212",
    status: "CONNECTED",
    syncStatus: "NEVER_SYNCED",
    syncError: null,
    lastSyncAt: null,
    syncStartedAt: null,
    lastFailedSyncAt: null,
    ...overrides,
  });
  return id;
}

function emptyPage() {
  return { ok: true, data: { items: [], nextCursor: null } };
}

beforeEach(() => {
  vi.clearAllMocks();
  connectionRows.clear();
  accountTable.rows.clear();
  positionTable.rows.clear();
  orderTable.rows.clear();
  activityTable.rows.clear();
  transactionTable.rows.clear();
  staleLockMs.value = 10 * 60_000;

  getDecryptedTrading212Credentials.mockResolvedValue({ apiKey: "key", apiSecret: "secret" });
  getAccountSummary.mockResolvedValue({ ok: true, data: { currencyCode: "USD", totalValue: 1000 } });
  getPositions.mockResolvedValue({ ok: true, data: [] });
  getOrderHistoryPage.mockResolvedValue(emptyPage());
  getDividendsPage.mockResolvedValue(emptyPage());
  getTransactionsPage.mockResolvedValue(emptyPage());
});

describe("syncTrading212 — connection state", () => {
  it("returns not_connected when there's no stored connection", async () => {
    getDecryptedTrading212Credentials.mockResolvedValue(null);
    expect(await syncTrading212("user-1")).toEqual({ status: "not_connected" });
  });
});

describe("syncTrading212 — locking (Requirement 4)", () => {
  it("returns already_syncing when the connection is currently SYNCING and the lock is fresh", async () => {
    seedConnection("user-1", "conn-user-1", { syncStatus: "SYNCING", syncStartedAt: new Date() });

    const result = await syncTrading212("user-1");

    expect(result).toEqual({ status: "already_syncing" });
  });

  it("recovers a stale SYNCING lock (a crashed process) and proceeds normally", async () => {
    seedConnection("user-1", "conn-user-1", {
      syncStatus: "SYNCING",
      syncStartedAt: new Date(Date.now() - 20 * 60_000), // older than the 10-minute stale threshold
    });

    const result = await syncTrading212("user-1");

    expect(result.status).toBe("synced");
  });

  it("two concurrent sync attempts for the same connection: exactly one proceeds, the other sees already_syncing", async () => {
    seedConnection("user-1");
    // Simulate genuine concurrency: both calls race to acquire the lock
    // before either's steps run, by making getAccountSummary hang until
    // both syncTrading212 calls have started.
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
    getAccountSummary.mockImplementation(async () => {
      await gate;
      return { ok: true, data: {} };
    });

    const attempt1 = syncTrading212("user-1");
    const attempt2 = syncTrading212("user-1");
    // Let both attempts reach the lock-acquire point before unblocking.
    await new Promise((r) => setTimeout(r, 0));
    releaseFirst();

    const [result1, result2] = await Promise.all([attempt1, attempt2]);
    const statuses = [result1.status, result2.status].sort();
    expect(statuses).toEqual(["already_syncing", "synced"]);
  });

  it("a different connection can sync independently while another is locked", async () => {
    seedConnection("user-a", "conn-a", { syncStatus: "SYNCING", syncStartedAt: new Date() });
    seedConnection("user-b", "conn-b");

    const resultA = await syncTrading212("user-a");
    const resultB = await syncTrading212("user-b");

    expect(resultA).toEqual({ status: "already_syncing" });
    expect(resultB.status).toBe("synced");
  });
});

describe("syncTrading212 — full success", () => {
  it("marks every step success and returns the structured per-step result (Requirement 18)", async () => {
    seedConnection("user-1");
    getPositions.mockResolvedValue({ ok: true, data: [{ externalTicker: "AAPL_US_EQ", quantity: 10 }] });

    const result = await syncTrading212("user-1");

    expect(result.status).toBe("synced");
    if (result.status === "synced" || result.status === "failed") {
      expect(result.account).toEqual({ status: "success", count: 1 });
      expect(result.positions).toEqual({ status: "success", count: 1 });
      expect(result.orders).toEqual({ status: "success", count: 0 });
      expect(result.dividends).toEqual({ status: "success", count: 0 });
      expect(result.transactions).toEqual({ status: "success", count: 0 });
      expect(typeof result.startedAt).toBe("string");
      expect(typeof result.completedAt).toBe("string");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }

    const conn = connectionRows.get("user-1")!;
    expect(conn.syncStatus).toBe("SYNCED");
    expect(conn.syncError).toBeNull();
    expect(conn.status).toBe("CONNECTED");
    expect(conn.lastSyncAt).toBeInstanceOf(Date);
  });

  it("clears a prior ERROR connection status on a fully successful sync", async () => {
    seedConnection("user-1", "conn-user-1", { status: "ERROR", syncStatus: "FAILED", syncError: "old auth failure" });

    await syncTrading212("user-1");

    expect(connectionRows.get("user-1")!.status).toBe("CONNECTED");
  });
});

describe("syncTrading212 — partial failure (Requirement 7)", () => {
  it("dividends failing does not prevent positions/orders/transactions from succeeding and committing", async () => {
    seedConnection("user-1");
    getPositions.mockResolvedValue({ ok: true, data: [{ externalTicker: "AAPL_US_EQ", quantity: 10 }] });
    getDividendsPage.mockResolvedValue({ ok: false, reason: "malformed_response", message: "bad shape" });

    const result = await syncTrading212("user-1");

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.account).toEqual({ status: "success", count: 1 });
      expect(result.positions).toEqual({ status: "success", count: 1 });
      expect(result.orders).toEqual({ status: "success", count: 0 });
      expect(result.dividends).toEqual({ status: "failed", message: "bad shape", category: "INVALID_RESPONSE" });
      expect(result.transactions).toEqual({ status: "success", count: 0 });
    }
    expect(positionTable.rows.size).toBe(1); // preserved despite the later failure
  });

  it("account failing with a non-authentication reason still lets positions/orders/etc attempt independently", async () => {
    seedConnection("user-1");
    getAccountSummary.mockResolvedValue({ ok: false, reason: "network_error", message: "Couldn't reach Trading 212" });
    getPositions.mockResolvedValue({ ok: true, data: [{ externalTicker: "AAPL_US_EQ", quantity: 5 }] });

    const result = await syncTrading212("user-1");

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.account.status).toBe("failed");
      expect(result.positions).toEqual({ status: "success", count: 1 });
    }
  });
});

describe("syncTrading212 — authentication short-circuit", () => {
  it("an AUTHENTICATION failure on the account step skips every remaining step rather than wasting requests", async () => {
    seedConnection("user-1");
    getAccountSummary.mockResolvedValue({ ok: false, reason: "unauthorized", message: "Trading 212 rejected these credentials" });

    const result = await syncTrading212("user-1");

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.account).toEqual({ status: "failed", message: "Trading 212 rejected these credentials", category: "AUTHENTICATION" });
      expect(result.positions).toEqual({ status: "skipped" });
      expect(result.orders).toEqual({ status: "skipped" });
      expect(result.dividends).toEqual({ status: "skipped" });
      expect(result.transactions).toEqual({ status: "skipped" });
    }
    expect(getPositions).not.toHaveBeenCalled();
    expect(getOrderHistoryPage).not.toHaveBeenCalled();
  });

  it("flags connection.status as ERROR ('needs attention') only for an authentication failure", async () => {
    seedConnection("user-1");
    getAccountSummary.mockResolvedValue({ ok: false, reason: "unauthorized", message: "rejected" });

    await syncTrading212("user-1");

    expect(connectionRows.get("user-1")!.status).toBe("ERROR");
  });

  it("never flags connection.status as ERROR for a transient (non-auth) failure", async () => {
    seedConnection("user-1");
    getAccountSummary.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });

    await syncTrading212("user-1");

    expect(connectionRows.get("user-1")!.status).toBe("CONNECTED");
  });

  it("a connection previously flagged ERROR is NOT auto-cleared by a still-failing sync, but IS cleared once it succeeds", async () => {
    seedConnection("user-1", "conn-user-1", { status: "ERROR" });
    getAccountSummary.mockResolvedValueOnce({ ok: false, reason: "unauthorized", message: "still bad" });
    await syncTrading212("user-1");
    expect(connectionRows.get("user-1")!.status).toBe("ERROR");

    getAccountSummary.mockResolvedValueOnce({ ok: true, data: {} });
    await syncTrading212("user-1");
    expect(connectionRows.get("user-1")!.status).toBe("CONNECTED");
  });
});

describe("syncTrading212 — state transitions (Requirement 6)", () => {
  it("sets lastFailedSyncAt on failure, distinct from lastSyncAt (last success)", async () => {
    seedConnection("user-1");
    // First: a real success.
    await syncTrading212("user-1");
    const afterSuccess = connectionRows.get("user-1")!;
    expect(afterSuccess.lastSyncAt).toBeInstanceOf(Date);
    expect(afterSuccess.lastFailedSyncAt).toBeNull();

    // Then: a failure — lastSyncAt (the earlier success) must be untouched.
    const previousLastSyncAt = afterSuccess.lastSyncAt;
    getDividendsPage.mockResolvedValue({ ok: false, reason: "provider_error", message: "Trading 212 returned a server error (500)" });
    await syncTrading212("user-1");
    const afterFailure = connectionRows.get("user-1")!;
    expect(afterFailure.lastSyncAt).toEqual(previousLastSyncAt);
    expect(afterFailure.lastFailedSyncAt).toBeInstanceOf(Date);
    expect(afterFailure.syncStatus).toBe("FAILED");
  });

  it("error is cleared (syncError null) after a successful recovery", async () => {
    seedConnection("user-1", "conn-user-1", { syncStatus: "FAILED", syncError: "previous failure" });

    await syncTrading212("user-1");

    expect(connectionRows.get("user-1")!.syncError).toBeNull();
  });
});

describe("syncTrading212 — never fabricates data, never leaks credentials", () => {
  it("never includes the decrypted apiKey/apiSecret anywhere in the sync result", async () => {
    seedConnection("user-1");
    getDecryptedTrading212Credentials.mockResolvedValue({ apiKey: "super-secret-key", apiSecret: "super-secret-value" });

    const result = await syncTrading212("user-1");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("super-secret-value");
  });

  it("an unexpected thrown error is reduced to a safe generic message and INTERNAL category, never the raw error", async () => {
    seedConnection("user-1");
    getAccountSummary.mockRejectedValue(new Error("some internal detail that shouldn't leak"));

    const result = await syncTrading212("user-1");

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.account).toEqual({
        status: "failed",
        message: "Trading 212 sync failed unexpectedly — try again shortly",
        category: "INTERNAL",
      });
      expect(JSON.stringify(result)).not.toContain("some internal detail");
    }
  });
});

describe("syncTrading212 — positions snapshot (Requirement 9, carried from Phase 2)", () => {
  it("replaces the position snapshot wholesale — a closed position disappears on the next sync", async () => {
    seedConnection("user-1");
    getPositions.mockResolvedValueOnce({ ok: true, data: [{ externalTicker: "AAPL_US_EQ", quantity: 10 }] });
    await syncTrading212("user-1");
    expect(positionTable.rows.size).toBe(1);

    getPositions.mockResolvedValueOnce({ ok: true, data: [] });
    await syncTrading212("user-1");

    expect(positionTable.rows.size).toBe(0);
  });

  it("a failed positions fetch preserves the last valid snapshot", async () => {
    seedConnection("user-1");
    getPositions.mockResolvedValueOnce({ ok: true, data: [{ externalTicker: "AAPL_US_EQ", quantity: 10 }] });
    await syncTrading212("user-1");
    expect(positionTable.rows.size).toBe(1);

    getPositions.mockResolvedValueOnce({ ok: false, reason: "network_error", message: "down" });
    const result = await syncTrading212("user-1");

    expect(result.status).toBe("failed");
    expect(positionTable.rows.size).toBe(1);
  });
});

describe("syncTrading212 — duplicate prevention (idempotency, carried from Phase 2)", () => {
  it("a repeated sync with identical order data creates no duplicate rows", async () => {
    seedConnection("user-1");
    getOrderHistoryPage.mockResolvedValue({
      ok: true,
      data: { items: [{ externalId: "order-1", externalTicker: "AAPL_US_EQ", externalCreatedAt: "2026-08-12T10:00:00.000Z" }], nextCursor: null },
    });

    await syncTrading212("user-1");
    await syncTrading212("user-1");

    expect(orderTable.rows.size).toBe(1);
  });
});

describe("syncTrading212 — user isolation", () => {
  it("two different users' synced data never cross-contaminate", async () => {
    seedConnection("user-a");
    seedConnection("user-b");
    getPositions.mockImplementation(async (creds: { apiKey: string }) =>
      creds.apiKey === "key-a"
        ? { ok: true, data: [{ externalTicker: "AAPL_US_EQ", quantity: 1 }] }
        : { ok: true, data: [{ externalTicker: "NVDA_US_EQ", quantity: 2 }] }
    );
    getDecryptedTrading212Credentials.mockImplementation(async (userId: string) =>
      userId === "user-a" ? { apiKey: "key-a", apiSecret: "s" } : { apiKey: "key-b", apiSecret: "s" }
    );

    await syncTrading212("user-a");
    await syncTrading212("user-b");

    const userAPositions = [...positionTable.rows.values()].filter((r) => r.userId === "user-a");
    const userBPositions = [...positionTable.rows.values()].filter((r) => r.userId === "user-b");
    expect(userAPositions).toHaveLength(1);
    expect(userBPositions).toHaveLength(1);
  });
});
