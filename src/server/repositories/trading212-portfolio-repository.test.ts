import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type AnyRow = Record<string, unknown>;

const { connectionRows, accountTable, positionTable, prismaMock } = vi.hoisted(() => {
  function makeTable() {
    const rows: AnyRow[] = [];
    return {
      rows,
      findUnique: async ({ where }: { where: AnyRow }) => {
        const id = where.brokerageConnectionId as string;
        return rows.find((r) => r.brokerageConnectionId === id) ?? null;
      },
      findMany: async ({ where, orderBy, take }: { where: AnyRow; orderBy?: AnyRow; take?: number }) => {
        let result = rows.filter((r) => r.brokerageConnectionId === where.brokerageConnectionId);
        if (where.userId) result = result.filter((r) => r.userId === where.userId);
        if (orderBy) {
          const [field] = Object.keys(orderBy);
          const dir = orderBy[field] === "desc" ? -1 : 1;
          result = [...result].sort((a, b) => {
            const av = a[field] as string | number | Date;
            const bv = b[field] as string | number | Date;
            return av > bv ? dir : av < bv ? -dir : 0;
          });
        }
        return take ? result.slice(0, take) : result;
      },
    };
  }

  const connectionRows = new Map<string, AnyRow>();
  return {
    connectionRows,
    accountTable: makeTable(),
    positionTable: makeTable(),
    prismaMock: {
      brokerageConnection: {
        findUnique: async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) =>
          connectionRows.get(where.userId_provider.userId) ?? null,
      },
    } as { brokerageConnection: AnyRow; brokerageAccount?: unknown; brokeragePosition?: unknown },
  };
});

prismaMock.brokerageAccount = accountTable;
prismaMock.brokeragePosition = positionTable;

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));

import { getTrading212Portfolio } from "./trading212-portfolio-repository";

function seedConnection(userId: string, overrides: Partial<AnyRow> = {}) {
  const id = `conn-${userId}`;
  connectionRows.set(userId, {
    id,
    userId,
    provider: "trading212",
    externalAccountId: `acct-${userId}`,
    status: "CONNECTED",
    syncStatus: "SYNCED",
    syncError: null,
    lastSyncAt: new Date("2026-09-07T10:00:00.000Z"),
    ...overrides,
  });
  return id;
}

function seedPosition(connectionId: string, userId: string, overrides: Partial<AnyRow> = {}) {
  positionTable.rows.push({
    id: `pos-${Math.random()}`,
    userId,
    brokerageConnectionId: connectionId,
    provider: "trading212",
    compassAssetId: null,
    externalTicker: "AAPL_US_EQ",
    externalName: null,
    currencyCode: "USD",
    quantity: 10,
    averagePrice: null,
    currentPrice: null,
    unrealizedPnl: null,
    ...overrides,
  });
}

beforeEach(() => {
  connectionRows.clear();
  accountTable.rows.length = 0;
  positionTable.rows.length = 0;
});

describe("getTrading212Portfolio", () => {
  it("returns null when the user has no Trading 212 connection at all", async () => {
    expect(await getTrading212Portfolio("user-1")).toBeNull();
  });

  it("returns an empty (but non-null) portfolio for a connected account that's never been synced", async () => {
    seedConnection("user-1", { syncStatus: "NEVER_SYNCED", lastSyncAt: null });

    const result = await getTrading212Portfolio("user-1");

    expect(result).not.toBeNull();
    expect(result!.account).toBeNull();
    expect(result!.positions).toEqual([]);
    expect(result!.syncStatus).toBe("NEVER_SYNCED");
    expect(result!.lastSyncAt).toBeNull();
  });

  it("returns positions and account data after a sync", async () => {
    const connId = seedConnection("user-1");
    accountTable.rows.push({
      brokerageConnectionId: connId,
      currencyCode: "USD",
      totalValue: 1000,
      cashAvailable: 100,
      cashInPies: null,
      cashReserved: null,
      investedValue: 900,
      realizedPnl: null,
      unrealizedPnl: 50,
    });
    seedPosition(connId, "user-1", { compassAssetId: "aapl", quantity: 10, averagePrice: 150, currentPrice: 181.42 });

    const result = await getTrading212Portfolio("user-1");

    expect(result!.account).toMatchObject({ totalValue: 1000, cashAvailable: 100 });
    expect(result!.positions).toHaveLength(1);
    expect(result!.positions[0]).toMatchObject({ compassAssetId: "aapl", quantity: 10 });
    expect(result!.accountId).toBe("acct-user-1");
    expect(result!.syncStatus).toBe("SYNCED");
    expect(result!.lastSyncAt).toBe("2026-09-07T10:00:00.000Z");
  });

  it("surfaces a failed sync state without exposing raw credentials or upstream errors", async () => {
    seedConnection("user-1", { syncStatus: "FAILED", syncError: "Couldn't reach Trading 212" });

    const result = await getTrading212Portfolio("user-1");

    expect(result!.syncStatus).toBe("FAILED");
    expect(result!.syncError).toBe("Couldn't reach Trading 212");
  });

  it("surfaces lastFailedSyncAt distinctly from lastSyncAt (Phase 5)", async () => {
    seedConnection("user-1", { lastFailedSyncAt: new Date("2026-09-07T09:00:00.000Z") });

    const result = await getTrading212Portfolio("user-1");

    expect(result!.lastFailedSyncAt).toBe("2026-09-07T09:00:00.000Z");
  });

  it("surfaces connectionStatus so the UI can distinguish a credential-invalidating ERROR from a normal CONNECTED state", async () => {
    seedConnection("user-1", { status: "ERROR" });

    const result = await getTrading212Portfolio("user-1");

    expect(result!.connectionStatus).toBe("ERROR");
  });

  it("keeps a mapped asset's compassAssetId and an unmapped instrument's raw ticker/name side by side", async () => {
    const connId = seedConnection("user-1");
    seedPosition(connId, "user-1", { compassAssetId: "aapl", externalTicker: "AAPL_US_EQ" });
    seedPosition(connId, "user-1", {
      compassAssetId: null,
      externalTicker: "VWCE_EQ",
      externalName: "Vanguard All-World ETF",
    });

    const result = await getTrading212Portfolio("user-1");

    const mapped = result!.positions.find((p) => p.externalTicker === "AAPL_US_EQ")!;
    const unmapped = result!.positions.find((p) => p.externalTicker === "VWCE_EQ")!;
    expect(mapped.compassAssetId).toBe("aapl");
    expect(unmapped.compassAssetId).toBeNull();
    expect(unmapped.externalName).toBe("Vanguard All-World ETF");
  });

  it("preserves each position's own currency rather than forcing a single account currency onto all of them", async () => {
    const connId = seedConnection("user-1");
    seedPosition(connId, "user-1", { externalTicker: "AAPL_US_EQ", currencyCode: "USD" });
    seedPosition(connId, "user-1", { externalTicker: "SAP_DE_EQ", currencyCode: "EUR" });

    const result = await getTrading212Portfolio("user-1");

    const currencies = result!.positions.map((p) => p.currencyCode).sort();
    expect(currencies).toEqual(["EUR", "USD"]);
  });

  it("never fabricates a market value or P&L when Trading 212 reported no current price", async () => {
    const connId = seedConnection("user-1");
    seedPosition(connId, "user-1", { averagePrice: 150, currentPrice: null, unrealizedPnl: null });

    const result = await getTrading212Portfolio("user-1");

    expect(result!.positions[0].currentPrice).toBeNull();
    expect(result!.positions[0].unrealizedPnl).toBeNull();
  });

  it("returns multiple positions accurately", async () => {
    const connId = seedConnection("user-1");
    seedPosition(connId, "user-1", { externalTicker: "AAPL_US_EQ" });
    seedPosition(connId, "user-1", { externalTicker: "NVDA_US_EQ" });
    seedPosition(connId, "user-1", { externalTicker: "TSLA_US_EQ" });

    const result = await getTrading212Portfolio("user-1");

    expect(result!.positions.map((p) => p.externalTicker).sort()).toEqual(["AAPL_US_EQ", "NVDA_US_EQ", "TSLA_US_EQ"]);
  });

  it("user A can never see user B's Trading 212 portfolio", async () => {
    const connA = seedConnection("user-a");
    seedConnection("user-b");
    seedPosition(connA, "user-a", { externalTicker: "AAPL_US_EQ" });

    const resultB = await getTrading212Portfolio("user-b");

    expect(resultB!.positions).toEqual([]);
  });
});
