import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const syncTrading212 = vi.fn();
vi.mock("./trading212-sync", () => ({
  syncTrading212: (...args: unknown[]) => syncTrading212(...args),
}));

const getTrading212SyncIntervalMs = vi.fn(() => 15 * 60_000);
const getTrading212MaxConcurrentSyncs = vi.fn(() => 3);
vi.mock("./trading212-sync-config", () => ({
  getTrading212SyncIntervalMs: () => getTrading212SyncIntervalMs(),
  getTrading212MaxConcurrentSyncs: () => getTrading212MaxConcurrentSyncs(),
}));

type AnyRow = Record<string, unknown>;
const { connections, findMany } = vi.hoisted(() => {
  const connections: AnyRow[] = [];
  const findMany = vi.fn(async ({ where }: { where: AnyRow }) => {
    const cutoff = ((where.OR as AnyRow[])[1].syncStartedAt as { lt: Date }).lt;
    return connections.filter((c) => {
      if (where.provider && c.provider !== where.provider) return false;
      const statusNot = (where.status as { not?: string } | undefined)?.not;
      if (statusNot && c.status === statusNot) return false;
      const started = c.syncStartedAt as Date | null;
      return started === null || started.getTime() < cutoff.getTime();
    });
  });
  return { connections, findMany };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: { brokerageConnection: { findMany: (...args: unknown[]) => findMany(...(args as [never])) } },
}));

import { runTrading212AutoSyncCycle } from "./trading212-scheduler";

beforeEach(() => {
  vi.clearAllMocks();
  connections.length = 0;
  getTrading212SyncIntervalMs.mockReturnValue(15 * 60_000);
  getTrading212MaxConcurrentSyncs.mockReturnValue(3);
  syncTrading212.mockResolvedValue({ status: "synced" });
});

function connection(overrides: AnyRow = {}) {
  return {
    id: `conn-${Math.random()}`,
    userId: `user-${Math.random()}`,
    provider: "trading212",
    status: "CONNECTED",
    syncStartedAt: null,
    ...overrides,
  };
}

describe("runTrading212AutoSyncCycle — eligibility", () => {
  it("selects an eligible connection (never synced) and syncs it", async () => {
    const conn = connection({ userId: "user-1" });
    connections.push(conn);

    const result = await runTrading212AutoSyncCycle();

    expect(syncTrading212).toHaveBeenCalledWith("user-1");
    expect(result.eligible).toBe(1);
    expect(result.synced).toBe(1);
  });

  it("skips a connection flagged ERROR (needs attention — Requirement 3/12)", async () => {
    connections.push(connection({ userId: "user-1", status: "ERROR" }));

    const result = await runTrading212AutoSyncCycle();

    expect(syncTrading212).not.toHaveBeenCalled();
    expect(result.eligible).toBe(0);
  });

  it("skips a connection that was synced more recently than the configured interval", async () => {
    connections.push(connection({ userId: "user-1", syncStartedAt: new Date(Date.now() - 5 * 60_000) }));

    const result = await runTrading212AutoSyncCycle();

    expect(syncTrading212).not.toHaveBeenCalled();
    expect(result.eligible).toBe(0);
  });

  it("includes a connection whose last attempt is older than the configured interval", async () => {
    connections.push(connection({ userId: "user-1", syncStartedAt: new Date(Date.now() - 20 * 60_000) }));

    const result = await runTrading212AutoSyncCycle();

    expect(syncTrading212).toHaveBeenCalledWith("user-1");
    expect(result.eligible).toBe(1);
  });

  it("handles multiple users independently in one cycle", async () => {
    connections.push(connection({ userId: "user-a" }), connection({ userId: "user-b" }), connection({ userId: "user-c" }));

    const result = await runTrading212AutoSyncCycle();

    expect(syncTrading212).toHaveBeenCalledWith("user-a");
    expect(syncTrading212).toHaveBeenCalledWith("user-b");
    expect(syncTrading212).toHaveBeenCalledWith("user-c");
    expect(result.eligible).toBe(3);
    expect(result.synced).toBe(3);
  });
});

describe("runTrading212AutoSyncCycle — concurrency (Requirement 10)", () => {
  it("never runs more than the configured concurrency limit at once", async () => {
    getTrading212MaxConcurrentSyncs.mockReturnValue(2);
    for (let i = 0; i < 6; i++) connections.push(connection({ userId: `user-${i}` }));

    let inFlight = 0;
    let maxInFlight = 0;
    syncTrading212.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { status: "synced" };
    });

    await runTrading212AutoSyncCycle();

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(syncTrading212).toHaveBeenCalledTimes(6);
  });

  it("processes every eligible connection even when concurrency is bounded below the total count", async () => {
    getTrading212MaxConcurrentSyncs.mockReturnValue(1);
    connections.push(connection({ userId: "user-a" }), connection({ userId: "user-b" }));

    const result = await runTrading212AutoSyncCycle();

    expect(result.eligible).toBe(2);
    expect(result.synced).toBe(2);
  });
});

describe("runTrading212AutoSyncCycle — result aggregation", () => {
  it("counts synced/failed/alreadySyncing outcomes correctly", async () => {
    connections.push(connection({ userId: "user-a" }), connection({ userId: "user-b" }), connection({ userId: "user-c" }));
    syncTrading212
      .mockResolvedValueOnce({ status: "synced" })
      .mockResolvedValueOnce({ status: "failed", message: "x" })
      .mockResolvedValueOnce({ status: "already_syncing" });

    const result = await runTrading212AutoSyncCycle();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.alreadySyncing).toBe(1);
  });

  it("one connection throwing unexpectedly does not stop the rest of the cycle", async () => {
    connections.push(connection({ userId: "user-a" }), connection({ userId: "user-b" }));
    syncTrading212.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ status: "synced" });

    const result = await runTrading212AutoSyncCycle();

    expect(result.eligible).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("returns zero counts and never calls syncTrading212 when nothing is eligible", async () => {
    const result = await runTrading212AutoSyncCycle();

    expect(syncTrading212).not.toHaveBeenCalled();
    expect(result).toMatchObject({ eligible: 0, synced: 0, failed: 0, alreadySyncing: 0 });
  });
});
