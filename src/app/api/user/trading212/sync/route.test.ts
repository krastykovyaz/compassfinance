import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const syncTrading212 = vi.fn();
vi.mock("@/server/trading212/trading212-sync", () => ({
  syncTrading212: (...args: unknown[]) => syncTrading212(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
});

describe("POST /api/user/trading212/sync", () => {
  it("returns 401 when unauthenticated", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await POST();

    expect(res.status).toBe(401);
  });

  it("scopes the sync to the session's own userId, never a client-supplied one", async () => {
    syncTrading212.mockResolvedValue({ status: "synced" });

    await POST();

    expect(syncTrading212).toHaveBeenCalledWith("user-1");
  });

  it("returns the full structured sync result on success", async () => {
    const result = {
      status: "synced",
      startedAt: "2026-09-07T10:00:00.000Z",
      completedAt: "2026-09-07T10:00:02.000Z",
      durationMs: 2000,
      account: { status: "success", count: 1 },
      positions: { status: "success", count: 2 },
      orders: { status: "success", count: 3 },
      dividends: { status: "success", count: 1 },
      transactions: { status: "success", count: 0 },
    };
    syncTrading212.mockResolvedValue(result);

    const res = await POST();
    const body = await res.json();

    expect(body).toEqual(result);
  });

  it("returns 400 with a safe message when there's no connection to sync", async () => {
    syncTrading212.mockResolvedValue({ status: "not_connected" });

    const res = await POST();

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/connect/i);
  });

  it("returns 200 with the structured failure (not a thrown error) when the sync itself fails", async () => {
    const result = {
      status: "failed",
      startedAt: "2026-09-07T10:00:00.000Z",
      completedAt: "2026-09-07T10:00:01.000Z",
      durationMs: 1000,
      message: "dividends: Trading 212 is rate-limiting requests right now — try again shortly",
      account: { status: "success", count: 1 },
      positions: { status: "success", count: 0 },
      orders: { status: "success", count: 0 },
      dividends: { status: "failed", message: "Trading 212 is rate-limiting requests right now — try again shortly", category: "RATE_LIMIT" },
      transactions: { status: "success", count: 0 },
    };
    syncTrading212.mockResolvedValue(result);

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
  });

  it("returns 200 with already_syncing (Requirement 4/13) rather than treating it as an error", async () => {
    syncTrading212.mockResolvedValue({ status: "already_syncing" });

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "already_syncing" });
  });
});
