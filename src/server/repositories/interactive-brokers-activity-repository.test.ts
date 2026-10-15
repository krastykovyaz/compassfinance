import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type AnyRow = Record<string, unknown>;

const { connectionRows, orderTable, activityTable, prismaMock } = vi.hoisted(() => {
  // Matches real Prisma's semantics for the two compound shapes the
  // repository now sends: `orderBy` as an array of single-field
  // objects (multi-key sort, applied in array order) and a top-level
  // `OR` array of sub-where clauses (each evaluated as an AND of its
  // own fields, combined with OR) — needed for the (externalCreatedAt,
  // id) tie-break cursor that fixes same-timestamp pagination.
  function matchesClause(row: AnyRow, clause: AnyRow): boolean {
    return Object.entries(clause).every(([field, condition]) => {
      const value = row[field];
      if (condition && typeof condition === "object" && !(condition instanceof Date)) {
        const cond = condition as { lt?: unknown };
        if ("lt" in cond) {
          const lt = cond.lt;
          if (lt instanceof Date) return (value as Date).getTime() < lt.getTime();
          return (value as string) < (lt as string);
        }
        return true;
      }
      if (condition instanceof Date) return (value as Date).getTime() === condition.getTime();
      return value === condition;
    });
  }

  function makeTable() {
    const rows: AnyRow[] = [];
    return {
      rows,
      findMany: async ({ where, orderBy, take }: { where: AnyRow; orderBy?: AnyRow | AnyRow[]; take?: number }) => {
        const { OR, ...rest } = where;
        let result = rows.filter((r) => matchesClause(r, rest));
        if (OR) {
          const orClauses = OR as AnyRow[];
          result = result.filter((r) => orClauses.some((clause) => matchesClause(r, clause)));
        }
        const orderByList = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
        if (orderByList.length > 0) {
          result = [...result].sort((a, b) => {
            for (const clause of orderByList) {
              const [field] = Object.keys(clause);
              const dir = clause[field] === "desc" ? -1 : 1;
              const av = a[field] as string | number | Date;
              const bv = b[field] as string | number | Date;
              if (av > bv) return dir;
              if (av < bv) return -dir;
            }
            return 0;
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
  it("is empty for an account whose only rows are trades and dividends (an OAuth-synced account has no cash movements to show)", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");
    seedActivity(connId, "user-1");

    for (const kind of ["fees", "deposits", "withdrawals"] as const) {
      expect(await getInteractiveBrokersActivity("user-1", { kind })).toEqual({ items: [], nextCursor: null });
    }
  });

  it("returns each kind from the same activity table, classified from IBKR's wording and the amount's sign", async () => {
    const connId = seedConnection("user-1");
    seedActivity(connId, "user-1", { type: "Deposits/Withdrawals", amount: 1000, externalId: "in", externalCreatedAt: new Date(2026, 0, 3) });
    seedActivity(connId, "user-1", { type: "Deposits/Withdrawals", amount: -400, externalId: "out", externalCreatedAt: new Date(2026, 0, 2) });
    seedActivity(connId, "user-1", { type: "Other Fees", amount: -2, externalId: "fee", externalCreatedAt: new Date(2026, 0, 1) });
    seedActivity(connId, "user-1", { type: "Dividends", amount: 5, externalId: "div", externalCreatedAt: new Date(2025, 11, 1) });

    const ids = async (kind: "fees" | "deposits" | "withdrawals" | "dividends") =>
      (await getInteractiveBrokersActivity("user-1", { kind })).items.map((i) => i.externalId);

    expect(await ids("deposits")).toEqual(["in"]);
    expect(await ids("withdrawals")).toEqual(["out"]);
    expect(await ids("fees")).toEqual(["fee"]);
    expect(await ids("dividends")).toEqual(["div"]);
  });

  it("never shows another user's cash movements", async () => {
    const mine = seedConnection("user-1");
    const theirs = seedConnection("user-2");
    seedActivity(theirs, "user-2", { type: "Deposits/Withdrawals", amount: 9, externalId: "theirs" });
    seedActivity(mine, "user-1", { type: "Deposits/Withdrawals", amount: 1, externalId: "mine" });

    const page = await getInteractiveBrokersActivity("user-1", { kind: "deposits" });

    expect(page.items.map((i) => i.externalId)).toEqual(["mine"]);
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

  it("ends the list on a malformed cursor instead of throwing or serving page one again (a cursor is only ever sent by an appending \"load more\", so page one again would show every row twice)", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");

    const page = await getInteractiveBrokersActivity("user-1", { kind: "trades", cursor: "not-a-real-cursor" });

    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("ends the list on a cursor with an unparseable date — never lets `new Date(NaN)` reach Prisma", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");
    const badCursor = Buffer.from(JSON.stringify({ orders: { at: "garbage-not-a-date", id: "x" } }), "utf8").toString("base64url");

    const page = await getInteractiveBrokersActivity("user-1", { kind: "trades", cursor: badCursor });

    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("ends the list on a well-formed cursor in the OLD flat format (a tab left open across the cursor-format change)", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");
    const staleCursor = Buffer.from(JSON.stringify({ before: "2026-08-01T00:00:00.000Z" }), "utf8").toString("base64url");

    for (const kind of ["all", "trades", "dividends"] as const) {
      const page = await getInteractiveBrokersActivity("user-1", { kind, cursor: staleCursor });
      expect(page).toEqual({ items: [], nextCursor: null });
    }
  });

  it("still serves the first page when no cursor is sent at all", async () => {
    const connId = seedConnection("user-1");
    seedOrder(connId, "user-1");

    const page = await getInteractiveBrokersActivity("user-1", { kind: "trades" });

    expect(page.items).toHaveLength(1);
  });

  it("returns a null cursor when the page size lands exactly on the last row — no \"load more\" that would fetch nothing", async () => {
    const connId = seedConnection("user-1");
    for (let i = 0; i < 4; i++) {
      seedOrder(connId, "user-1", { externalCreatedAt: new Date(2026, 7, i + 1), externalId: `ibkr-exact-${i}` });
    }

    const firstPage = await getInteractiveBrokersActivity("user-1", { kind: "trades", limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull(); // two more rows really do remain

    const secondPage = await getInteractiveBrokersActivity("user-1", { kind: "trades", limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.nextCursor).toBeNull(); // limit reached on the table's final row
  });

  it("advances past every row sharing the exact same timestamp instead of dropping the remainder — IBKR reports only day-granularity dates, so many trades routinely share one timestamp", async () => {
    const connId = seedConnection("user-1");
    const sameDay = new Date("2026-08-12T00:00:00.000Z");
    for (let i = 0; i < 5; i++) {
      seedOrder(connId, "user-1", { externalCreatedAt: sameDay, externalId: `ibkr-txn-${i}` });
    }

    const firstPage = await getInteractiveBrokersActivity("user-1", { kind: "trades", limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await getInteractiveBrokersActivity("user-1", { kind: "trades", limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(2);

    const thirdPage = await getInteractiveBrokersActivity("user-1", { kind: "trades", limit: 2, cursor: secondPage.nextCursor! });
    expect(thirdPage.items).toHaveLength(1);
    expect(thirdPage.nextCursor).toBeNull();

    const allIds = [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(5); // every row seen exactly once, none dropped or duplicated
  });
});

describe("getInteractiveBrokersActivity — dividends filter never returns a false-empty page", () => {
  it("skips past non-dividend rows within one request instead of returning an empty page with a live nextCursor", async () => {
    const connId = seedConnection("user-1");
    // 20 non-dividend rows (fees/interest/etc, classified as "transfer")
    // newer than one real dividend further back — a single-page
    // fetch-then-filter would return items: [] with nextCursor set.
    for (let i = 0; i < 20; i++) {
      seedActivity(connId, "user-1", { type: "Other Fee", externalId: `fee-${i}`, externalCreatedAt: new Date(2026, 7, 20 - i) });
    }
    seedActivity(connId, "user-1", { type: "Dividend", externalId: "real-dividend", externalCreatedAt: new Date(2026, 6, 1) });

    const page = await getInteractiveBrokersActivity("user-1", { kind: "dividends", limit: 20 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].kind).toBe("dividend");
  });

  it("caps the scan so one request can't page through an unbounded number of non-dividend rows", async () => {
    const connId = seedConnection("user-1");
    for (let i = 0; i < 500; i++) {
      seedActivity(connId, "user-1", { type: "Other Fee", externalId: `fee-${i}`, externalCreatedAt: new Date(2026, 0, 1, 0, 0, i) });
    }

    const page = await getInteractiveBrokersActivity("user-1", { kind: "dividends", limit: 20 });

    expect(page.items).toHaveLength(0);
    // Not exhausted (500 rows remain unscanned past the 10-page cap) —
    // nextCursor must stay non-null so the client can keep paging rather
    // than being told "there's nothing here."
    expect(page.nextCursor).not.toBeNull();
  });
});
