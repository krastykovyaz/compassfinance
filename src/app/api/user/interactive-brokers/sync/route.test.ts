import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const syncInteractiveBrokers = vi.fn();
vi.mock("@/server/interactive-brokers/interactive-brokers-sync", () => ({
  syncInteractiveBrokers: (...args: unknown[]) => syncInteractiveBrokers(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
});

describe("POST /api/user/interactive-brokers/sync", () => {
  it("returns 401 when unauthenticated", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await POST();

    expect(res.status).toBe(401);
    expect(syncInteractiveBrokers).not.toHaveBeenCalled();
  });

  it("scopes the sync to the session's own userId, never a client-supplied one", async () => {
    syncInteractiveBrokers.mockResolvedValue({ status: "synced" });

    await POST();

    expect(syncInteractiveBrokers).toHaveBeenCalledWith("user-1");
  });

  it("returns the full structured sync result on success", async () => {
    const result = {
      status: "synced",
      startedAt: "2026-09-08T10:00:00.000Z",
      completedAt: "2026-09-08T10:00:02.000Z",
      durationMs: 2000,
      account: { status: "success", count: 1 },
      positions: { status: "success", count: 3 },
    };
    syncInteractiveBrokers.mockResolvedValue(result);

    const res = await POST();
    const body = await res.json();

    expect(body).toEqual(result);
  });

  it("returns 400 with a safe message when there's no connection to sync", async () => {
    syncInteractiveBrokers.mockResolvedValue({ status: "not_connected" });

    const res = await POST();

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/connect/i);
  });

  it("returns 200 with the structured failure (not a thrown error) when the sync itself fails", async () => {
    const result = {
      status: "failed",
      startedAt: "2026-09-08T10:00:00.000Z",
      completedAt: "2026-09-08T10:00:01.000Z",
      durationMs: 1000,
      message: "positions: Interactive Brokers is rate-limiting this request — try again shortly",
      account: { status: "success", count: 1 },
      positions: { status: "failed", message: "Interactive Brokers is rate-limiting this request — try again shortly", category: "RATE_LIMIT" },
    };
    syncInteractiveBrokers.mockResolvedValue(result);

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
  });

  it("returns 200 with already_syncing rather than treating it as an error", async () => {
    syncInteractiveBrokers.mockResolvedValue({ status: "already_syncing" });

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "already_syncing" });
  });

  it("returns 200 with needs_account_selection and the candidate accounts, never throwing", async () => {
    const result = { status: "needs_account_selection", accounts: [{ accountId: "U1" }, { accountId: "U2" }] };
    syncInteractiveBrokers.mockResolvedValue(result);

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
  });
});
