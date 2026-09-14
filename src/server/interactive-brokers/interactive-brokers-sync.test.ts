import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getDecryptedInteractiveBrokersCredentials = vi.fn();
const setInteractiveBrokersSelectedAccount = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-repository", () => ({
  getDecryptedInteractiveBrokersCredentials: (...args: unknown[]) => getDecryptedInteractiveBrokersCredentials(...args),
  setInteractiveBrokersSelectedAccount: (...args: unknown[]) => setInteractiveBrokersSelectedAccount(...args),
}));

const getInteractiveBrokersConfig = vi.fn();
vi.mock("./interactive-brokers-config", () => ({
  getInteractiveBrokersConfig: () => getInteractiveBrokersConfig(),
}));

const fetchInteractiveBrokersLiveSessionToken = vi.fn();
const fetchInteractiveBrokersPortfolioAccounts = vi.fn();
const fetchInteractiveBrokersAccountLedger = vi.fn();
const fetchInteractiveBrokersPositions = vi.fn();
const fetchInteractiveBrokersTransactions = vi.fn();
vi.mock("./interactive-brokers-client", () => ({
  fetchInteractiveBrokersLiveSessionToken: (...args: unknown[]) => fetchInteractiveBrokersLiveSessionToken(...args),
  fetchInteractiveBrokersPortfolioAccounts: (...args: unknown[]) => fetchInteractiveBrokersPortfolioAccounts(...args),
  fetchInteractiveBrokersAccountLedger: (...args: unknown[]) => fetchInteractiveBrokersAccountLedger(...args),
  fetchInteractiveBrokersPositions: (...args: unknown[]) => fetchInteractiveBrokersPositions(...args),
  fetchInteractiveBrokersTransactions: (...args: unknown[]) => fetchInteractiveBrokersTransactions(...args),
  buildInteractiveBrokersAuthenticatedCredentials: (consumerKey: string, accessToken: string, liveSessionToken: string) => ({
    consumerKey,
    accessToken,
    liveSessionToken,
    realm: "limited_poa",
  }),
}));

// ---------------------------------------------------------------------------
// In-memory Prisma double — same style established in trading212-sync.test.ts.
// ---------------------------------------------------------------------------

type AnyRow = Record<string, unknown>;

const { connectionRows, accountTable, positionTable, orderTable, activityTable, prismaMock } = vi.hoisted(() => {
  function makeTable() {
    const rows = new Map<string, AnyRow>();
    return {
      rows,
      findUnique: async ({ where }: { where: AnyRow }) => {
        const id = where.brokerageConnectionId as string;
        return [...rows.values()].find((r) => r.brokerageConnectionId === id) ?? null;
      },
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: AnyRow;
        orderBy?: Record<string, "asc" | "desc">;
        take?: number;
      }) => {
        let result = [...rows.values()];
        if (where.brokerageConnectionId) result = result.filter((r) => r.brokerageConnectionId === where.brokerageConnectionId);
        if (where.userId) result = result.filter((r) => r.userId === where.userId);
        if (where.provider) result = result.filter((r) => r.provider === where.provider);
        if (orderBy) {
          const [field, direction] = Object.entries(orderBy)[0];
          result = [...result].sort((a, b) => {
            const av = String(a[field]);
            const bv = String(b[field]);
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return direction === "desc" ? -cmp : cmp;
          });
        }
        if (typeof take === "number") result = result.slice(0, take);
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
  const accountTable = makeTable();
  const positionTable = makeTable();
  const orderTable = makeTable();
  const activityTable = makeTable();

  function matchesWhereOr(row: AnyRow, or: AnyRow[]): boolean {
    return or.some((clause) =>
      Object.entries(clause).every(([field, cond]) => {
        const val = row[field];
        if (cond === null) return val === null;
        if (typeof cond === "object" && cond !== null) {
          const c = cond as { not?: unknown; lt?: Date };
          if ("not" in c) return val !== c.not;
          if ("lt" in c && c.lt instanceof Date) return val instanceof Date && val.getTime() < c.lt.getTime();
        }
        return val === cond;
      })
    );
  }

  const prismaMock = {
    brokerageConnection: {
      findUnique: async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) =>
        connectionRows.get(where.userId_provider.userId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: AnyRow }) => {
        const existing = [...connectionRows.values()].find((r) => r.id === where.id)!;
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }: { where: AnyRow; data: AnyRow }) => {
        const row = [...connectionRows.values()].find((r) => r.id === where.id || (where.userId && r.userId === where.userId));
        if (!row) return { count: 0 };
        const orMatches = where.OR ? matchesWhereOr(row, where.OR as AnyRow[]) : true;
        if (!orMatches) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    brokerageAccount: accountTable,
    brokeragePosition: positionTable,
    brokerageOrder: orderTable,
    brokerageActivity: activityTable,
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return { connectionRows, accountTable, positionTable, orderTable, activityTable, prismaMock };
});

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));

import { syncInteractiveBrokers } from "./interactive-brokers-sync";

function seedConnection(userId: string, overrides: AnyRow = {}) {
  const id = `conn-${userId}`;
  connectionRows.set(userId, {
    id,
    userId,
    provider: "INTERACTIVE_BROKERS",
    status: "CONNECTED",
    syncStatus: "NEVER_SYNCED",
    syncError: null,
    lastSyncAt: null,
    syncStartedAt: null,
    lastFailedSyncAt: null,
    externalAccountId: null,
    lastActivitySyncAt: null,
    ...overrides,
  });
  return id;
}

const ONE_ACCOUNT = [{ accountId: "U1234567", currency: "USD", type: "LIVE", clearingStatus: "O", accountTitle: null, accountAlias: null }];

beforeEach(() => {
  vi.clearAllMocks();
  connectionRows.clear();
  accountTable.rows.clear();
  positionTable.rows.clear();
  orderTable.rows.clear();
  activityTable.rows.clear();
  delete process.env.IBKR_SYNC_STALE_LOCK_MINUTES;
  delete process.env.IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES;

  getDecryptedInteractiveBrokersCredentials.mockResolvedValue({ accessToken: "access-tok", accessTokenSecret: "access-secret" });
  getInteractiveBrokersConfig.mockReturnValue({ consumerKey: "test-consumer-key", privateKeyPem: "pem" });
  fetchInteractiveBrokersLiveSessionToken.mockResolvedValue({ ok: true, data: { liveSessionToken: "lst", expiresAt: null } });
  fetchInteractiveBrokersPortfolioAccounts.mockResolvedValue({ ok: true, data: ONE_ACCOUNT });
  fetchInteractiveBrokersAccountLedger.mockResolvedValue({
    ok: true,
    data: { currencyCode: "USD", netLiquidationValue: 10000, cashBalance: 2000, unrealizedPnl: 500, realizedPnl: 0 },
  });
  fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [] });
  fetchInteractiveBrokersTransactions.mockResolvedValue({ ok: true, data: [] });
});

function ibkrPosition(overrides: AnyRow = {}) {
  return {
    conid: "9408",
    symbol: "MCD",
    quantity: 12,
    averagePrice: 266.2,
    marketPrice: 258.83,
    marketValue: 3105.96,
    unrealizedPnl: 88.55,
    realizedPnl: 0,
    currency: "USD",
    assetClass: "STK",
    sector: "Consumer, Cyclical",
    expiry: null,
    strike: null,
    multiplier: null,
    underlyingConid: null,
    ...overrides,
  };
}

describe("syncInteractiveBrokers — connection state", () => {
  it("returns not_connected when there's no stored connection", async () => {
    getDecryptedInteractiveBrokersCredentials.mockResolvedValue(null);
    expect(await syncInteractiveBrokers("user-1")).toEqual({ status: "not_connected" });
  });

  it("returns already_syncing when the connection is currently SYNCING and the lock is fresh", async () => {
    seedConnection("user-1", { syncStatus: "SYNCING", syncStartedAt: new Date() });

    const result = await syncInteractiveBrokers("user-1");

    expect(result).toEqual({ status: "already_syncing" });
    expect(fetchInteractiveBrokersLiveSessionToken).not.toHaveBeenCalled();
  });

  it("recovers a stale SYNCING lock and proceeds normally", async () => {
    seedConnection("user-1", { syncStatus: "SYNCING", syncStartedAt: new Date(Date.now() - 20 * 60_000) });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
  });
});

describe("syncInteractiveBrokers — not configured", () => {
  it("fails cleanly, never calling the client, when Interactive Brokers isn't configured", async () => {
    seedConnection("user-1");
    getInteractiveBrokersConfig.mockReturnValue(null);

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("failed");
    expect(fetchInteractiveBrokersLiveSessionToken).not.toHaveBeenCalled();
  });
});

describe("syncInteractiveBrokers — account discovery and selection (Milestone 21)", () => {
  it("auto-selects a single discovered account and persists it onto the connection", async () => {
    seedConnection("user-1");

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    expect(setInteractiveBrokersSelectedAccount).toHaveBeenCalledWith("user-1", "U1234567");
  });

  it("does not re-persist the account id when it's already correctly selected", async () => {
    seedConnection("user-1", { externalAccountId: "U1234567" });

    await syncInteractiveBrokers("user-1");

    expect(setInteractiveBrokersSelectedAccount).not.toHaveBeenCalled();
  });

  it("SECURITY: never silently picks one of multiple accounts — returns needs_account_selection instead", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPortfolioAccounts.mockResolvedValue({
      ok: true,
      data: [...ONE_ACCOUNT, { accountId: "U7654321", currency: "USD", type: "LIVE", clearingStatus: "O", accountTitle: null, accountAlias: null }],
    });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("needs_account_selection");
    if (result.status === "needs_account_selection") {
      expect(result.accounts.map((a) => a.accountId)).toEqual(["U1234567", "U7654321"]);
    }
    expect(setInteractiveBrokersSelectedAccount).not.toHaveBeenCalled();
    expect(fetchInteractiveBrokersAccountLedger).not.toHaveBeenCalled();
  });

  it("re-selects a previously chosen account automatically, without prompting again, even when others are also visible", async () => {
    seedConnection("user-1", { externalAccountId: "U7654321" });
    fetchInteractiveBrokersPortfolioAccounts.mockResolvedValue({
      ok: true,
      data: [...ONE_ACCOUNT, { accountId: "U7654321", currency: "USD", type: "LIVE", clearingStatus: "O", accountTitle: null, accountAlias: null }],
    });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    expect(fetchInteractiveBrokersAccountLedger).toHaveBeenCalledWith("U7654321", expect.anything());
  });

  it("fails with a clear message, touching no account/position data, when discovery returns no accounts", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPortfolioAccounts.mockResolvedValue({ ok: true, data: [] });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("failed");
    expect(fetchInteractiveBrokersAccountLedger).not.toHaveBeenCalled();
  });
});

describe("syncInteractiveBrokers — account step", () => {
  it("persists real ledger data, deriving investedValue from netLiquidationValue - cashBalance", async () => {
    seedConnection("user-1");

    await syncInteractiveBrokers("user-1");

    const row = [...accountTable.rows.values()][0];
    expect(row.currencyCode).toBe("USD");
    expect(row.totalValue).toBe(10000);
    expect(row.cashAvailable).toBe(2000);
    expect(row.investedValue).toBe(8000);
    expect(row.unrealizedPnl).toBe(500);
    expect(row.cashInPies).toBeNull();
    expect(row.cashReserved).toBeNull();
  });

  it("leaves investedValue null rather than guessing when a required input is missing", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersAccountLedger.mockResolvedValue({
      ok: true,
      data: { currencyCode: "USD", netLiquidationValue: null, cashBalance: 100, unrealizedPnl: null, realizedPnl: null },
    });

    await syncInteractiveBrokers("user-1");

    const row = [...accountTable.rows.values()][0];
    expect(row.investedValue).toBeNull();
  });
});

describe("syncInteractiveBrokers — positions step", () => {
  it("normalizes and persists real positions, keyed by conid", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({
      ok: true,
      data: [
        {
          conid: "9408",
          symbol: "MCD",
          quantity: 12,
          averagePrice: 266.2,
          marketPrice: 258.83,
          marketValue: 3105.96,
          unrealizedPnl: 88.55,
          realizedPnl: 0,
          currency: "USD",
          assetClass: "STK",
          sector: "Consumer, Cyclical",
          expiry: null,
          strike: null,
          multiplier: null,
          underlyingConid: null,
        },
      ],
    });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    const row = [...positionTable.rows.values()][0];
    expect(row.externalId).toBe("9408");
    expect(row.externalTicker).toBe("MCD");
    expect(row.quantity).toBe(12);
    expect(row.assetClass).toBe("STK");
    expect(row.sector).toBe("Consumer, Cyclical");
  });

  it("replaces the position snapshot rather than appending — a position that disappeared from IBKR is removed", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({
      ok: true,
      data: [{ conid: "1", symbol: "AAA", quantity: 1, averagePrice: 1, marketPrice: 1, marketValue: 1, unrealizedPnl: 0, realizedPnl: 0, currency: "USD", assetClass: "STK", sector: null, expiry: null, strike: null, multiplier: null, underlyingConid: null }],
    });
    await syncInteractiveBrokers("user-1");
    expect(positionTable.rows.size).toBe(1);

    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [] });
    await syncInteractiveBrokers("user-1");

    expect(positionTable.rows.size).toBe(0);
  });

  it("never creates duplicate rows across repeated syncs of the same position", async () => {
    seedConnection("user-1");
    const position = { conid: "1", symbol: "AAA", quantity: 1, averagePrice: 1, marketPrice: 1, marketValue: 1, unrealizedPnl: 0, realizedPnl: 0, currency: "USD", assetClass: "STK", sector: null, expiry: null, strike: null, multiplier: null, underlyingConid: null };
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [position] });

    await syncInteractiveBrokers("user-1");
    await syncInteractiveBrokers("user-1");

    expect(positionTable.rows.size).toBe(1);
  });

  it("maps a mappable STK position to its Compass asset id", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({
      ok: true,
      data: [{ conid: "265598", symbol: "AAPL", quantity: 1, averagePrice: 1, marketPrice: 1, marketValue: 1, unrealizedPnl: 0, realizedPnl: 0, currency: "USD", assetClass: "STK", sector: null, expiry: null, strike: null, multiplier: null, underlyingConid: null }],
    });

    await syncInteractiveBrokers("user-1");

    const row = [...positionTable.rows.values()][0];
    expect(row.compassAssetId).toBe("aapl");
  });

  it("leaves an unmapped position's compassAssetId null without failing the sync", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({
      ok: true,
      data: [{ conid: "999", symbol: "AAPL", quantity: 1, averagePrice: 1, marketPrice: 1, marketValue: 1, unrealizedPnl: 0, realizedPnl: 0, currency: "USD", assetClass: "OPT", sector: null, expiry: "20261218", strike: 150, multiplier: 100, underlyingConid: "265598" }],
    });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    const row = [...positionTable.rows.values()][0];
    expect(row.compassAssetId).toBeNull();
    expect(row.expiry).toBe("20261218");
    expect(row.strike).toBe(150);
    expect(row.underlyingConid).toBe("265598");
  });
});

describe("syncInteractiveBrokers — failure handling never destroys valid data", () => {
  it("keeps previously-synced account/position rows when a later sync's positions step fails", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({
      ok: true,
      data: [{ conid: "1", symbol: "AAA", quantity: 1, averagePrice: 1, marketPrice: 1, marketValue: 1, unrealizedPnl: 0, realizedPnl: 0, currency: "USD", assetClass: "STK", sector: null, expiry: null, strike: null, multiplier: null, underlyingConid: null }],
    });
    await syncInteractiveBrokers("user-1");
    expect(positionTable.rows.size).toBe(1);
    expect(accountTable.rows.size).toBe(1);

    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: false, reason: "provider_error", message: "IBKR had a problem" });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("failed");
    expect(positionTable.rows.size).toBe(1); // untouched — never wiped by an unrelated failure
    expect(accountTable.rows.size).toBe(1);
  });

  it("classifies an authentication failure as needing attention (status ERROR)", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersLiveSessionToken.mockResolvedValue({ ok: false, reason: "unauthorized", message: "rejected" });

    await syncInteractiveBrokers("user-1");

    expect(connectionRows.get("user-1")!.status).toBe("ERROR");
    expect(connectionRows.get("user-1")!.syncStatus).toBe("FAILED");
  });

  it("does NOT mark the connection as needing attention for a transient (network/provider) failure", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: false, reason: "network_error", message: "timeout" });

    await syncInteractiveBrokers("user-1");

    expect(connectionRows.get("user-1")!.status).toBe("CONNECTED");
    expect(connectionRows.get("user-1")!.syncStatus).toBe("FAILED");
  });

  it("never sets lastSyncAt on a failed sync", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: false, reason: "network_error", message: "timeout" });

    await syncInteractiveBrokers("user-1");

    expect(connectionRows.get("user-1")!.lastSyncAt).toBeNull();
  });

  it("sets lastSyncAt only after both steps succeed", async () => {
    seedConnection("user-1");

    await syncInteractiveBrokers("user-1");

    expect(connectionRows.get("user-1")!.lastSyncAt).toBeInstanceOf(Date);
    expect(connectionRows.get("user-1")!.syncStatus).toBe("SYNCED");
  });
});

describe("syncInteractiveBrokers — activity step (Phase 3)", () => {
  it("skips with reason no_positions when the account holds nothing, without calling the rate-limited endpoint", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [] });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    if (result.status === "synced") expect(result.activity).toEqual({ status: "skipped", reason: "no_positions" });
    expect(fetchInteractiveBrokersTransactions).not.toHaveBeenCalled();
    expect(connectionRows.get("user-1")!.lastActivitySyncAt).toBeNull(); // no real attempt made
  });

  it("skips with reason cooldown when the 15-minute window hasn't elapsed, without calling the rate-limited endpoint", async () => {
    seedConnection("user-1", { lastActivitySyncAt: new Date(Date.now() - 5 * 60_000) });
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [ibkrPosition()] });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    if (result.status === "synced") expect(result.activity).toEqual({ status: "skipped", reason: "cooldown" });
    expect(fetchInteractiveBrokersTransactions).not.toHaveBeenCalled();
  });

  it("attempts the fetch once the 15-minute cooldown has elapsed", async () => {
    seedConnection("user-1", { lastActivitySyncAt: new Date(Date.now() - 16 * 60_000) });
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [ibkrPosition()] });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    if (result.status === "synced") expect(result.activity.status).toBe("success");
    expect(fetchInteractiveBrokersTransactions).toHaveBeenCalledWith("U1234567", 9408, expect.anything());
  });

  it("selects the position whose stringified conid sorts first, deterministically, when multiple positions exist", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({
      ok: true,
      data: [ibkrPosition({ conid: "500" }), ibkrPosition({ conid: "100", symbol: "AAA" })],
    });

    await syncInteractiveBrokers("user-1");

    expect(fetchInteractiveBrokersTransactions).toHaveBeenCalledWith("U1234567", 100, expect.anything());
  });

  it("stores a Buy/Sell row in BrokerageOrder as an already-filled execution", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [ibkrPosition()] });
    fetchInteractiveBrokersTransactions.mockResolvedValue({
      ok: true,
      data: [{ conid: 9408, description: "McDonald's Corp", type: "Sell", quantity: -5, price: 260, amount: 1300, currencyCode: "USD", occurredAt: "2026-08-01T00:00:00.000Z" }],
    });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    if (result.status === "synced") expect(result.activity).toEqual({ status: "success", count: 1 });
    expect(orderTable.rows.size).toBe(1);
    const row = [...orderTable.rows.values()][0];
    expect(row.side).toBe("SELL");
    expect(row.status).toBe("FILLED");
    expect(row.quantity).toBe(5);
    expect(row.filledQuantity).toBe(5);
    expect(row.fillPrice).toBe(260);
    expect(row.filledValue).toBe(1300);
    expect(row.externalTicker).toBe("MCD"); // resolved from the already-synced position, not IBKR's company-name field
    expect(activityTable.rows.size).toBe(0);
  });

  it("stores a non-Buy/Sell row in BrokerageActivity, preserving the raw type string", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [ibkrPosition()] });
    fetchInteractiveBrokersTransactions.mockResolvedValue({
      ok: true,
      data: [{ conid: 9408, description: "McDonald's Corp", type: "Dividend", quantity: 0, price: null, amount: 4.5, currencyCode: "USD", occurredAt: "2026-08-01T00:00:00.000Z" }],
    });

    await syncInteractiveBrokers("user-1");

    expect(activityTable.rows.size).toBe(1);
    const row = [...activityTable.rows.values()][0];
    expect(row.type).toBe("Dividend");
    expect(row.amount).toBe(4.5);
    expect(orderTable.rows.size).toBe(0);
  });

  it("is idempotent — running twice with identical IBKR data never creates a duplicate row", async () => {
    seedConnection("user-1", { lastActivitySyncAt: new Date(Date.now() - 20 * 60_000) });
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [ibkrPosition()] });
    fetchInteractiveBrokersTransactions.mockResolvedValue({
      ok: true,
      data: [{ conid: 9408, description: "McDonald's Corp", type: "Buy", quantity: 3, price: 250, amount: -750, currencyCode: "USD", occurredAt: "2026-08-01T00:00:00.000Z" }],
    });

    await syncInteractiveBrokers("user-1");
    // Force past the cooldown again for a second real attempt with the SAME data.
    connectionRows.get("user-1")!.lastActivitySyncAt = new Date(Date.now() - 20 * 60_000);
    await syncInteractiveBrokers("user-1");

    expect(orderTable.rows.size).toBe(1); // upserted onto the same row, never duplicated
  });

  it("updates lastActivitySyncAt after a real attempt, success or failure — but never on a skip", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [ibkrPosition()] });

    await syncInteractiveBrokers("user-1");
    expect(connectionRows.get("user-1")!.lastActivitySyncAt).toBeInstanceOf(Date);

    // Now force a real failed attempt and confirm it STILL updates the cooldown clock.
    connectionRows.get("user-1")!.lastActivitySyncAt = new Date(Date.now() - 20 * 60_000);
    fetchInteractiveBrokersTransactions.mockResolvedValue({ ok: false, reason: "provider_error", message: "IBKR error" });
    await syncInteractiveBrokers("user-1");
    expect(connectionRows.get("user-1")!.lastActivitySyncAt).toBeInstanceOf(Date);
  });

  it("an activity step failure never flips the overall sync to failed — account+positions already succeeded", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: true, data: [ibkrPosition()] });
    fetchInteractiveBrokersTransactions.mockResolvedValue({ ok: false, reason: "rate_limited", message: "too fast" });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("synced");
    if (result.status === "synced") {
      expect(result.activity.status).toBe("failed");
    }
    expect(connectionRows.get("user-1")!.syncStatus).toBe("SYNCED");
    expect(connectionRows.get("user-1")!.status).toBe("CONNECTED");
  });

  it("was never attempted when account/positions themselves failed, and never touches the cooldown clock", async () => {
    seedConnection("user-1");
    fetchInteractiveBrokersPositions.mockResolvedValue({ ok: false, reason: "network_error", message: "timeout" });

    const result = await syncInteractiveBrokers("user-1");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.activity).toEqual({ status: "skipped", reason: "not_attempted" });
    expect(fetchInteractiveBrokersTransactions).not.toHaveBeenCalled();
    expect(connectionRows.get("user-1")!.lastActivitySyncAt).toBeNull();
  });
});
