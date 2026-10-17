import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLEX_REPORT_XML } from "./__fixtures__/flex-report";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  brokerageConnection: { findUnique: vi.fn(), update: vi.fn() },
  brokerageAccount: { upsert: vi.fn() },
  brokeragePosition: { deleteMany: vi.fn(), upsert: vi.fn() },
  brokerageOrder: { upsert: vi.fn() },
  brokerageActivity: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));

const acquireSyncLock = vi.fn();
const releaseSyncLockAsFailed = vi.fn();
vi.mock("@/server/brokerage/sync-lock", () => ({
  acquireSyncLock: (...args: unknown[]) => acquireSyncLock(...args),
  releaseSyncLockAsFailed: (...args: unknown[]) => releaseSyncLockAsFailed(...args),
}));

const getFlexCredentials = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-repository", () => ({
  getDecryptedInteractiveBrokersFlexCredentials: (...args: unknown[]) => getFlexCredentials(...args),
}));

const fetchFlexReport = vi.fn();
vi.mock("./interactive-brokers-flex-client", () => ({
  fetchFlexReport: (...args: unknown[]) => fetchFlexReport(...args),
}));

const syncInteractiveBrokers = vi.fn();
vi.mock("./interactive-brokers-sync", () => ({
  syncInteractiveBrokers: (...args: unknown[]) => syncInteractiveBrokers(...args),
}));

import { sumUnrealizedInBase, syncInteractiveBrokersFlex, syncInteractiveBrokersForUser } from "./interactive-brokers-flex-sync";

const CREDENTIALS = { token: "tok12345678", queryId: "1" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.brokerageConnection.findUnique.mockResolvedValue({ id: "conn-1", userId: "user-1", externalAccountId: null });
  prismaMock.brokerageConnection.update.mockResolvedValue({});
  prismaMock.brokerageAccount.upsert.mockResolvedValue({});
  prismaMock.brokeragePosition.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.brokeragePosition.upsert.mockResolvedValue({});
  prismaMock.brokerageOrder.upsert.mockResolvedValue({});
  prismaMock.brokerageActivity.upsert.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  acquireSyncLock.mockResolvedValue(true);
  releaseSyncLockAsFailed.mockResolvedValue(undefined);
  fetchFlexReport.mockResolvedValue({ ok: true, data: FLEX_REPORT_XML });
});

describe("syncInteractiveBrokersFlex", () => {
  it("reports not_connected without touching anything when the user has no connection", async () => {
    prismaMock.brokerageConnection.findUnique.mockResolvedValue(null);

    expect(await syncInteractiveBrokersFlex("user-1", CREDENTIALS)).toEqual({ status: "not_connected" });
    expect(fetchFlexReport).not.toHaveBeenCalled();
  });

  it("reports already_syncing without calling Interactive Brokers when the lock is held", async () => {
    acquireSyncLock.mockResolvedValue(false);

    expect(await syncInteractiveBrokersFlex("user-1", CREDENTIALS)).toEqual({ status: "already_syncing" });
    expect(fetchFlexReport).not.toHaveBeenCalled();
  });

  it("writes the account value, cash, invested value and unrealized P/L converted to the base currency", async () => {
    const result = await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    expect(result.status).toBe("synced");
    const create = prismaMock.brokerageAccount.upsert.mock.calls[0][0].create;
    expect(create).toMatchObject({ userId: "user-1", brokerageConnectionId: "conn-1", provider: "INTERACTIVE_BROKERS", currencyCode: "EUR", totalValue: 10624, cashAvailable: 1500.25 });
    expect(create.investedValue).toBeCloseTo(10624 - 1500.25, 6);
    expect(create.unrealizedPnl).toBeCloseTo(500 * 0.92 + -50 * 0.92, 6); // each position converted with its own rate
    expect(create.realizedPnl).toBeNull(); // a rolling period is not a lifetime figure
  });

  it("replaces the positions: deletes the ones no longer held and upserts the rest by conid", async () => {
    await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    expect(prismaMock.brokeragePosition.deleteMany).toHaveBeenCalledWith({ where: { brokerageConnectionId: "conn-1", externalId: { notIn: ["265598", "76792991"] } } });
    const created = prismaMock.brokeragePosition.upsert.mock.calls.map((c) => c[0].create);
    expect(created.map((c) => [c.externalId, c.externalTicker, c.quantity])).toEqual([
      ["265598", "AAPL", 10],
      ["76792991", "TSLA", -5],
    ]);
    expect(created[0]).toMatchObject({ averagePrice: 150, currentPrice: 200, unrealizedPnl: 500, assetClass: "STK" });
  });

  it("stores executions as filled orders with an unsigned notional, idempotently by id", async () => {
    await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    const orders = prismaMock.brokerageOrder.upsert.mock.calls.map((c) => c[0]);
    expect(orders.map((o) => o.create.externalId)).toEqual(["flex-trade-111", "flex-trade-112"]);
    expect(orders[1].where).toEqual({ brokerageConnectionId_externalId: { brokerageConnectionId: "conn-1", externalId: "flex-trade-112" } });
    expect(orders[1].create).toMatchObject({ side: "SELL", status: "FILLED", quantity: 4, filledQuantity: 4, fillPrice: 190, filledValue: 760 });
  });

  it("stores cash transactions and transfers as activity with IBKR's own type wording preserved", async () => {
    await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    const rows = prismaMock.brokerageActivity.upsert.mock.calls.map((c) => c[0].create);
    expect(rows.map((r) => [r.externalId, r.type, r.amount])).toEqual([
      ["flex-cash-900", "Dividends", 2.4],
      ["flex-cash-901", "Deposits/Withdrawals", 1000],
      ["flex-cash-902", "Other Fees", -1],
      ["flex-transfer-950", "Transfer (INTERNAL)", -200],
    ]);
  });

  it("marks the connection SYNCED, clears the error and records the real account id", async () => {
    const result = await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    expect(prismaMock.brokerageConnection.update).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: expect.objectContaining({ syncStatus: "SYNCED", syncError: null, status: "CONNECTED", externalAccountId: "U1234567" }),
    });
    expect(result).toMatchObject({ status: "synced", account: { status: "success", count: 1 }, positions: { status: "success", count: 2 }, activity: { status: "success", count: 6 } });
    expect(releaseSyncLockAsFailed).not.toHaveBeenCalled();
  });

  it("writes nothing and flags the connection when the token was rejected", async () => {
    fetchFlexReport.mockResolvedValue({ ok: false, reason: "token_expired", message: "This Flex token has expired." });

    const result = await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    expect(result).toMatchObject({ status: "failed", message: "This Flex token has expired." });
    expect(prismaMock.brokerageAccount.upsert).not.toHaveBeenCalled();
    expect(prismaMock.brokeragePosition.deleteMany).not.toHaveBeenCalled(); // earlier positions stay when a sync fails
    expect(releaseSyncLockAsFailed).toHaveBeenCalledWith("conn-1", expect.objectContaining({ syncError: "This Flex token has expired.", needsAttention: true }), undefined);
  });

  it.each([
    ["network_error", false],
    ["rate_limited", false],
    ["not_ready", false],
    ["invalid_query", true],
    ["ip_restricted", true],
  ])("flags the connection as needing attention for %s only when the user must act (%s)", async (reason, needsAttention) => {
    fetchFlexReport.mockResolvedValue({ ok: false, reason, message: "m" });

    await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    expect(releaseSyncLockAsFailed.mock.calls[0][1].needsAttention).toBe(needsAttention);
  });

  it("refuses a report whose query has no Open Positions section instead of deleting every stored position", async () => {
    fetchFlexReport.mockResolvedValue({ ok: true, data: '<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1234567"><CashReportCurrency accountId="U1234567" currency="BASE_SUMMARY" endingCash="10" /></FlexStatement></FlexStatements></FlexQueryResponse>' });
    const result = await syncInteractiveBrokersFlex("user-1", CREDENTIALS);
    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.message).toMatch(/no Open Positions section/);
    expect(prismaMock.brokeragePosition.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.brokerageAccount.upsert).not.toHaveBeenCalled();
    expect(releaseSyncLockAsFailed).toHaveBeenCalledWith("conn-1", expect.objectContaining({ needsAttention: false }), undefined);
  });

  it("fails cleanly on text that is not a Flex report", async () => {
    fetchFlexReport.mockResolvedValue({ ok: true, data: "<html>Maintenance</html>" });

    const result = await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    expect(result.status).toBe("failed");
    expect(prismaMock.brokerageAccount.upsert).not.toHaveBeenCalled();
    expect(releaseSyncLockAsFailed.mock.calls[0][1].needsAttention).toBe(false);
  });

  it("fails without a raw database message when a write throws, and releases the lock", async () => {
    prismaMock.brokerageAccount.upsert.mockRejectedValue(new Error("SQLITE_BUSY: database is locked at /secret/path"));

    const result = await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("SQLITE");
    expect(JSON.stringify(result)).not.toContain("/secret/path");
    expect(releaseSyncLockAsFailed).toHaveBeenCalledTimes(1);
  });

  it("still releases the lock, best-effort, when something unexpected throws mid-sync", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchFlexReport.mockRejectedValue(new Error("boom"));

    const result = await syncInteractiveBrokersFlex("user-1", CREDENTIALS);

    expect(result).toMatchObject({ status: "failed", message: "An unexpected error occurred while syncing." });
    expect(releaseSyncLockAsFailed).toHaveBeenCalledWith("conn-1", expect.objectContaining({ needsAttention: false }), { bestEffort: true });
    logged.mockRestore();
  });
});

describe("syncInteractiveBrokersForUser", () => {
  it("syncs from the Flex report when the user connected that way", async () => {
    getFlexCredentials.mockResolvedValue(CREDENTIALS);

    const result = await syncInteractiveBrokersForUser("user-1");

    expect(result.status).toBe("synced");
    expect(syncInteractiveBrokers).not.toHaveBeenCalled();
  });

  it("takes the OAuth path otherwise", async () => {
    getFlexCredentials.mockResolvedValue(null);
    syncInteractiveBrokers.mockResolvedValue({ status: "not_connected" });

    expect(await syncInteractiveBrokersForUser("user-1")).toEqual({ status: "not_connected" });
    expect(fetchFlexReport).not.toHaveBeenCalled();
  });
});

describe("sumUnrealizedInBase", () => {
  const position = (over: Record<string, unknown>) => ({ conid: "1", symbol: "X", description: null, assetClass: "STK", currency: "USD", quantity: 1, markPrice: 1, costBasisPrice: 1, unrealizedPnl: 10, fxRateToBase: 0.5, multiplier: 1, strike: null, expiry: null, underlyingConid: null, ...over });

  it("converts each position with its own rate", () => {
    expect(sumUnrealizedInBase([position({}), position({ unrealizedPnl: -4, fxRateToBase: 2 })] as never, "EUR")).toBe(10 * 0.5 + -4 * 2);
  });

  it("treats a position already in the base currency as rate 1 when the report gives no rate", () => {
    expect(sumUnrealizedInBase([position({ currency: "EUR", fxRateToBase: null })] as never, "EUR")).toBe(10);
  });

  it("is unknown (null), never a sum of mixed currencies, when a foreign position has no rate", () => {
    expect(sumUnrealizedInBase([position({ fxRateToBase: null })] as never, "EUR")).toBeNull();
  });

  it("is null for no positions and when any position's own figure is missing", () => {
    expect(sumUnrealizedInBase([], "EUR")).toBeNull();
    expect(sumUnrealizedInBase([position({ unrealizedPnl: null })] as never, "EUR")).toBeNull();
  });
});
