import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type AnyRow = Record<string, unknown>;

const { connectionRows, orderTable, activityTable, transactionTable, prismaMock } = vi.hoisted(() => {
  function makeTable() {
    const rows: AnyRow[] = [];
    return {
      rows,
      findMany: async ({ where, orderBy, take }: { where: AnyRow; orderBy?: AnyRow; take?: number }) => {
        let result = rows.filter((r) => r.brokerageConnectionId === where.brokerageConnectionId);
        if (where.userId) result = result.filter((r) => r.userId === where.userId);
        if (where.compassAssetId) result = result.filter((r) => r.compassAssetId === where.compassAssetId);
        if (where.type) result = result.filter((r) => r.type === where.type);
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
    transactionTable: makeTable(),
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
prismaMock.brokerageTransaction = transactionTable;

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));

import { getTrading212Activity } from "./trading212-activity-repository";

function seedConnection(userId: string) {
  const id = `conn-${userId}`;
  connectionRows.set(userId, { id, userId, provider: "trading212" });
  return id;
}

function seedOrder(connectionId: string, userId: string, overrides: Partial<AnyRow> = {}) {
  orderTable.rows.push({
    id: `row-${Math.random()}`,
    userId,
    brokerageConnectionId: connectionId,
    externalId: `order-${Math.random()}`,
    compassAssetId: null,
    externalTicker: "AAPL_US_EQ",
    externalName: null,
    side: "BUY",
    status: "FILLED",
    quantity: 10,
    filledQuantity: 10,
    fillPrice: 181.42,
    filledValue: 1814.2,
    currencyCode: "USD",
    externalCreatedAt: new Date("2026-08-12T10:00:00.000Z"),
    ...overrides,
  });
}

function seedDividend(connectionId: string, userId: string, overrides: Partial<AnyRow> = {}) {
  activityTable.rows.push({
    id: `row-${Math.random()}`,
    userId,
    brokerageConnectionId: connectionId,
    externalId: `div-${Math.random()}`,
    compassAssetId: null,
    externalTicker: "AAPL_US_EQ",
    externalName: null,
    quantity: null,
    amount: 4.32,
    currencyCode: "USD",
    externalCreatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  });
}

function seedTransaction(connectionId: string, userId: string, overrides: Partial<AnyRow> = {}) {
  transactionTable.rows.push({
    id: `row-${Math.random()}`,
    userId,
    brokerageConnectionId: connectionId,
    externalId: `tx-${Math.random()}`,
    type: "DEPOSIT",
    amount: 500,
    currencyCode: "USD",
    externalCreatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  });
}

beforeEach(() => {
  connectionRows.clear();
  orderTable.rows.length = 0;
  activityTable.rows.length = 0;
  transactionTable.rows.length = 0;
});

describe("getTrading212Activity — connection state", () => {
  it("returns an empty page when there's no connection", async () => {
    expect(await getTrading212Activity("user-1")).toEqual({ items: [], nextCursor: null });
  });
});

describe("getTrading212Activity — kind: all (merged feed)", () => {
  it("merges orders, dividends, and transactions into one feed without duplicating any of them", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");
    seedDividend(connId, "user-1");
    seedTransaction(connId, "user-1");

    const result = await getTrading212Activity("user-1");

    expect(result.items).toHaveLength(3);
    expect(result.items.map((i) => i.kind).sort()).toEqual(["deposit", "dividend", "execution"]);
  });

  it("every item in the feed is genuinely Trading 212's — never Hyperliquid or Paper Trading data slipping in", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");
    seedDividend(connId, "user-1");
    seedTransaction(connId, "user-1");

    const result = await getTrading212Activity("user-1");

    expect(result.items.every((i) => i.provider === "trading212")).toBe(true);
  });

  it("sorts the merged feed newest-first using the provider's own timestamp", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { externalCreatedAt: new Date("2026-01-01T00:00:00.000Z") });
    seedDividend(connId, "user-1", { externalCreatedAt: new Date("2026-06-01T00:00:00.000Z") });

    const result = await getTrading212Activity("user-1");

    expect(result.items[0].kind).toBe("dividend");
    expect(result.items[1].kind).toBe("execution");
  });

  it("never mixes one user's activity into another's feed (IDOR)", async () => {
    const connA = seedConnection("user-a");
    seedConnection("user-b");
    seedOrder(connA, "user-a");

    expect(await getTrading212Activity("user-b")).toEqual({ items: [], nextCursor: null });
  });

  it("returns an empty page for a connected-but-never-synced account", async () => {
    seedConnection("user-1");
    expect(await getTrading212Activity("user-1")).toEqual({ items: [], nextCursor: null });
  });
});

describe("getTrading212Activity — order vs execution derivation", () => {
  it("a fully filled order appears once, as an execution — never a redundant order entry too", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { status: "FILLED", quantity: 10, filledQuantity: 10 });

    const result = await getTrading212Activity("user-1");

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("execution");
  });

  it("a partially filled order appears as BOTH an order item and an execution item, never as if the full quantity executed", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { status: "PARTIALLY_FILLED", quantity: 10, filledQuantity: 6, fillPrice: 180, filledValue: 1080 });

    const result = await getTrading212Activity("user-1");

    expect(result.items).toHaveLength(2);
    const execution = result.items.find((i) => i.kind === "execution")!;
    const order = result.items.find((i) => i.kind === "order")!;
    expect(execution.quantity).toBe(6);
    expect(order.quantity).toBe(10);
    expect(order.status).toBe("PARTIALLY_FILLED");
  });

  it("a cancelled order with zero fill appears once, as an order — never fabricates an execution", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { status: "CANCELLED", filledQuantity: 0, fillPrice: null, filledValue: null });

    const result = await getTrading212Activity("user-1");

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("order");
  });
});

describe("getTrading212Activity — single-table kind filters", () => {
  it("'trades' returns only real executions, excluding a cancelled/unfilled order", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { status: "FILLED", filledQuantity: 10 });
    seedOrder(connId, "user-1", { status: "CANCELLED", filledQuantity: 0 });

    const result = await getTrading212Activity("user-1", { kind: "trades" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("execution");
  });

  it("'orders' returns nothing for a cleanly fully filled order — there's no separate lifecycle view to show (Requirement 13)", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { status: "FILLED", quantity: 10, filledQuantity: 10 });

    const result = await getTrading212Activity("user-1", { kind: "orders" });

    expect(result.items).toEqual([]);
  });

  it("'orders' returns the order-lifecycle view for a partially filled order", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { status: "PARTIALLY_FILLED", quantity: 10, filledQuantity: 6 });

    const result = await getTrading212Activity("user-1", { kind: "orders" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("order");
    expect(result.items[0].quantity).toBe(10);
  });

  it("'dividends' returns only dividend rows", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");
    seedDividend(connId, "user-1");

    const result = await getTrading212Activity("user-1", { kind: "dividends" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe("dividend");
  });

  it("'fees'/'deposits'/'withdrawals' each return only their own transaction type", async () => {
    const connId = seedConnection("user-1");
    seedTransaction(connId, "user-1", { type: "DEPOSIT", amount: 500 });
    seedTransaction(connId, "user-1", { type: "WITHDRAW", amount: -200 });
    seedTransaction(connId, "user-1", { type: "FEE", amount: -1.5 });

    expect((await getTrading212Activity("user-1", { kind: "deposits" })).items).toHaveLength(1);
    expect((await getTrading212Activity("user-1", { kind: "withdrawals" })).items).toHaveLength(1);
    expect((await getTrading212Activity("user-1", { kind: "fees" })).items).toHaveLength(1);
    expect((await getTrading212Activity("user-1", { kind: "fees" })).items[0].kind).toBe("fee");
  });

  it("account-level filters (deposits/withdrawals/fees) never apply to an asset-scoped request", async () => {
    const connId = seedConnection("user-1");
    seedTransaction(connId, "user-1", { type: "DEPOSIT" });

    const result = await getTrading212Activity("user-1", { kind: "deposits", assetId: "aapl" });

    expect(result.items).toEqual([]);
  });
});

describe("getTrading212Activity — asset filtering", () => {
  it("filters the merged feed to one asset and excludes transactions (which never carry an asset)", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { compassAssetId: "aapl" });
    seedOrder(connId, "user-1", { compassAssetId: "nvda" });
    seedTransaction(connId, "user-1");

    const result = await getTrading212Activity("user-1", { assetId: "aapl" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].compassAssetId).toBe("aapl");
  });

  it("never shows an unrelated Trading 212 instrument's activity under a different asset's filter", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { compassAssetId: "nvda", externalTicker: "NVDA_US_EQ" });

    const result = await getTrading212Activity("user-1", { assetId: "aapl" });

    expect(result.items).toEqual([]);
  });
});

describe("getTrading212Activity — pagination", () => {
  it("returns a nextCursor when more rows exist beyond the page, and null when the page is exhaustive", async () => {
    const connId = seedConnection("user-1");
    for (let i = 0; i < 5; i++) {
      seedOrder(connId, "user-1", { externalCreatedAt: new Date(2026, 0, i + 1) });
    }

    const firstPage = await getTrading212Activity("user-1", { kind: "trades", limit: 3 });
    expect(firstPage.items).toHaveLength(3);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await getTrading212Activity("user-1", { kind: "trades", limit: 3, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("never repeats an item already returned on an earlier page", async () => {
    const connId = seedConnection("user-1");
    for (let i = 0; i < 5; i++) {
      seedOrder(connId, "user-1", { externalId: `order-${i}`, externalCreatedAt: new Date(2026, 0, i + 1) });
    }

    const firstPage = await getTrading212Activity("user-1", { kind: "trades", limit: 3 });
    const secondPage = await getTrading212Activity("user-1", { kind: "trades", limit: 3, cursor: firstPage.nextCursor! });

    const firstIds = new Set(firstPage.items.map((i) => i.externalId));
    const overlap = secondPage.items.filter((i) => firstIds.has(i.externalId));
    expect(overlap).toEqual([]);
  });

  it("treats a malformed cursor as the beginning rather than erroring", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");

    const result = await getTrading212Activity("user-1", { kind: "trades", cursor: "not-a-real-cursor" });

    expect(result.items).toHaveLength(1);
  });
});

describe("getTrading212Activity — multi-currency", () => {
  it("keeps each order's own currency separate, never converting", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { currencyCode: "USD" });
    seedOrder(connId, "user-1", { currencyCode: "EUR" });

    const result = await getTrading212Activity("user-1", { kind: "trades" });

    expect(result.items.map((i) => i.currency).sort()).toEqual(["EUR", "USD"]);
  });
});

describe("getTrading212Activity — IDOR via pagination/cursor", () => {
  it("a cursor value can never surface another user's rows, regardless of its content", async () => {
    const connA = seedConnection("user-a");
    const connB = seedConnection("user-b");
    seedOrder(connA, "user-a", { externalCreatedAt: new Date("2026-05-01T00:00:00.000Z") });
    seedOrder(connB, "user-b", { externalCreatedAt: new Date("2026-06-01T00:00:00.000Z") });

    // A cursor timestamp deliberately chosen to be "after" user B's own
    // row (so, if the query were ever mis-scoped by connection, it could
    // wrongly surface it) — user A's own query must still only ever see
    // user A's own connection's rows.
    const forgedCursor = Buffer.from(JSON.stringify({ before: "2026-12-31T00:00:00.000Z" }), "utf8").toString("base64url");

    const result = await getTrading212Activity("user-a", { kind: "trades", cursor: forgedCursor });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].externalId).not.toBe(undefined);
    // Every returned row must belong to user A's own connection — assert
    // indirectly via the seeded ticker, since externalId is random per
    // seed call in this test file.
    const connAExternalIds = orderTable.rows.filter((r) => r.brokerageConnectionId === connA).map((r) => r.externalId);
    expect(connAExternalIds).toContain(result.items[0].externalId);
  });

  it("an asset-scoped cursor request stays scoped to that asset AND that user across pages", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1", { compassAssetId: "aapl", externalCreatedAt: new Date("2026-01-01T00:00:00.000Z") });
    seedOrder(connId, "user-1", { compassAssetId: "nvda", externalCreatedAt: new Date("2026-01-02T00:00:00.000Z") });
    seedOrder(connId, "user-1", { compassAssetId: "aapl", externalCreatedAt: new Date("2026-01-03T00:00:00.000Z") });

    const firstPage = await getTrading212Activity("user-1", { kind: "trades", assetId: "aapl", limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0].compassAssetId).toBe("aapl");

    const secondPage = await getTrading212Activity("user-1", {
      kind: "trades",
      assetId: "aapl",
      limit: 1,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items.every((i) => i.compassAssetId === "aapl")).toBe(true);
  });
});
