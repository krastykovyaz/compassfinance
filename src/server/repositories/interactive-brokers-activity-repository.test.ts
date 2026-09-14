import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type AnyRow = Record<string, unknown>;

const { connectionRows, orderTable, activityTable, prismaMock } = vi.hoisted(() => {
  function makeTable() {
    const rows: AnyRow[] = [];
    return {
      rows,
      findMany: async ({ where, orderBy, take }: { where: AnyRow; orderBy?: AnyRow; take?: number }) => {
        let result = rows.filter((r) => r.brokerageConnectionId === where.brokerageConnectionId);
        if (where.userId) result = result.filter((r) => r.userId === where.userId);
        if (where.compassAssetId) result = result.filter((r) => r.compassAssetId === where.compassAssetId);
        const lt = (where.externalCreatedAt as { lt?: Date } | undefined)?.lt;
        if (lt) result = result.filter((r) => (r.externalCreatedAt as Date).getTime() < lt.getTime());
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
    orderTable: makeTable(),
    activityTable: makeTable(),
    prismaMock: {
      brokerageConnection: {
        findUnique: async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) =>
          connectionRows.get(where.userId_provider.userId) ?? null,
      },
    } as { brokerageConnection: AnyRow; brokerageOrder?: unknown; brokerageActivity?: unknown; brokerageTransaction?: unknown },
  };
});

prismaMock.brokerageOrder = orderTable;
prismaMock.brokerageActivity = activityTable;
prismaMock.brokerageTransaction = { findMany: async () => [] };

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));

import { getInteractiveBrokersActivity } from "./interactive-brokers-activity-repository";

function seedConnection(userId: string) {
  const id = `conn-${userId}`;
  connectionRows.set(userId, { id, userId, provider: "INTERACTIVE_BROKERS" });
  return id;
}

function seedOrder(connectionId: string, userId: string, overrides: Partial<AnyRow> = {}) {
  orderTable.rows.push({
    id: `row-${Math.random()}`,
    userId,
    brokerageConnectionId: connectionId,
    externalId: `ibkr-txn-${Math.random()}`,
    compassAssetId: null,
    externalTicker: "MCD",
    externalName: "McDonald's Corp",
    side: "SELL",
    status: "FILLED",
    quantity: 5,
    filledQuantity: 5,
    fillPrice: 260,
    filledValue: 1300,
    currencyCode: "USD",
    externalCreatedAt: new Date("2026-08-12T10:00:00.000Z"),
    ...overrides,
  });
}

function seedActivity(connectionId: string, userId: string, overrides: Partial<AnyRow> = {}) {
  activityTable.rows.push({
    id: `row-${Math.random()}`,
    userId,
    brokerageConnectionId: connectionId,
    externalId: `ibkr-activity-${Math.random()}`,
    compassAssetId: null,
    externalTicker: "MCD",
    externalName: "McDonald's Corp",
    quantity: null,
    amount: 4.5,
    currencyCode: "USD",
    type: "Dividend",
    externalCreatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  });
}

beforeEach(() => {
  connectionRows.clear();
  orderTable.rows.length = 0;
  activityTable.rows.length = 0;
});

describe("getInteractiveBrokersActivity — no connection", () => {
  it("returns an empty page when the user has no Interactive Brokers connection", async () => {
    expect(await getInteractiveBrokersActivity("user-1")).toEqual({ items: [], nextCursor: null });
  });
});

describe("getInteractiveBrokersActivity — kind: orders / trades", () => {
  it("returns the execution view under kind=trades for a fully-filled IBKR row", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");

    const page = await getInteractiveBrokersActivity("user-1", { kind: "trades" });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].kind).toBe("execution");
    expect(page.items[0].provider).toBe("interactive_brokers");
    expect(page.items[0].direction).toBe("SELL");
  });

  it("never emits an order-lifecycle view for IBKR — kind=orders is always empty since IBKR rows are always already filled", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");

    const page = await getInteractiveBrokersActivity("user-1", { kind: "orders" });

    expect(page.items).toHaveLength(0);
  });

  it("scopes strictly to the caller's own connection — user A never sees user B's orders", async () => {
    const connA = seedConnection("user-a");
    seedConnection("user-b");
    seedOrder(connA, "user-a");

    const page = await getInteractiveBrokersActivity("user-b", { kind: "trades" });

    expect(page.items).toHaveLength(0);
  });
});

describe("getInteractiveBrokersActivity — kind: dividends", () => {
  it("returns a dividend-typed BrokerageActivity row as a dividend", async () => {
    const connId = seedConnection("user-1");
    seedActivity(connId, "user-1", { type: "Dividend" });

    const page = await getInteractiveBrokersActivity("user-1", { kind: "dividends" });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].kind).toBe("dividend");
    expect(page.items[0].grossAmount).toBe(4.5);
  });

  it("excludes a non-dividend BrokerageActivity row from the dividends filter", async () => {
    const connId = seedConnection("user-1");
    seedActivity(connId, "user-1", { type: "Adjustment" });

    const page = await getInteractiveBrokersActivity("user-1", { kind: "dividends" });

    expect(page.items).toHaveLength(0);
  });
});

describe("getInteractiveBrokersActivity — kind: fees / deposits / withdrawals", () => {
  it("always returns an empty page — no live IBKR source exists for these (documented limitation)", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");
    seedActivity(connId, "user-1");

    for (const kind of ["fees", "deposits", "withdrawals"] as const) {
      expect(await getInteractiveBrokersActivity("user-1", { kind })).toEqual({ items: [], nextCursor: null });
    }
  });
});

describe("getInteractiveBrokersActivity — kind: all", () => {
  it("merges orders and activity, sorted newest-first by the provider's own timestamp", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { externalCreatedAt: new Date("2026-08-01T00:00:00.000Z") });
    seedActivity(connId, "user-1", { externalCreatedAt: new Date("2026-08-15T00:00:00.000Z") });

    const page = await getInteractiveBrokersActivity("user-1", { kind: "all" });

    expect(page.items).toHaveLength(2);
    expect(page.items[0].kind).toBe("dividend"); // Aug 15 — newest first
    expect(page.items[1].kind).toBe("execution"); // Aug 1
  });

  it("filters to one asset via assetId, applying to both orders and activity", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { compassAssetId: "mcd" });
    seedOrder(connId, "user-1", { compassAssetId: "aapl" });
    seedActivity(connId, "user-1", { compassAssetId: "mcd" });

    const page = await getInteractiveBrokersActivity("user-1", { kind: "all", assetId: "mcd" });

    expect(page.items).toHaveLength(2);
  });
});

describe("getInteractiveBrokersActivity — pagination", () => {
  it("paginates via cursor, never returning duplicate items across pages", async () => {
    const connId = seedConnection("user-1");
    for (let i = 0; i < 5; i++) {
      seedOrder(connId, "user-1", { externalCreatedAt: new Date(2026, 7, i + 1) });
    }

    const firstPage = await getInteractiveBrokersActivity("user-1", { kind: "trades", limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await getInteractiveBrokersActivity("user-1", { kind: "trades", limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(2);

    const firstIds = new Set(firstPage.items.map((i) => i.id));
    const secondIds = new Set(secondPage.items.map((i) => i.id));
    expect([...firstIds].some((id) => secondIds.has(id))).toBe(false);
  });

  it("returns a null cursor once every item has been paged through", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");

    const page = await getInteractiveBrokersActivity("user-1", { kind: "trades", limit: 20 });

    expect(page.nextCursor).toBeNull();
  });

  it("never throws on a malformed cursor — treats it as the start", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");

    const page = await getInteractiveBrokersActivity("user-1", { kind: "trades", cursor: "not-a-real-cursor" });

    expect(page.items).toHaveLength(1);
  });
});
