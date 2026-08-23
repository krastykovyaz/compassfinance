import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const getHyperliquidAccount = vi.fn();
const getHyperliquidOpenOrders = vi.fn();
const getHyperliquidUserFills = vi.fn();
vi.mock("@/server/hyperliquid/service", () => ({
  getHyperliquidAccount: (...args: unknown[]) => getHyperliquidAccount(...args),
  getHyperliquidOpenOrders: (...args: unknown[]) => getHyperliquidOpenOrders(...args),
  getHyperliquidUserFills: (...args: unknown[]) => getHyperliquidUserFills(...args),
}));

import { GET } from "./route";

const ADDRESS = "0x1234567890123456789012345678901234567890";

function request(address?: string, dex?: string) {
  const params = new URLSearchParams();
  if (address) params.set("address", address);
  if (dex) params.set("dex", dex);
  const qs = params.toString();
  return new Request(`http://localhost/api/hyperliquid/account${qs ? `?${qs}` : ""}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  getHyperliquidAccount.mockResolvedValue({ status: "ok", account: { positions: [] } });
  getHyperliquidOpenOrders.mockResolvedValue({ status: "ok", orders: [] });
  getHyperliquidUserFills.mockResolvedValue({ status: "ok", fills: [] });
});

describe("GET /api/hyperliquid/account", () => {
  it("401s a signed-out request without ever calling the Hyperliquid service", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET(request(ADDRESS));

    expect(res.status).toBe(401);
    expect(getHyperliquidAccount).not.toHaveBeenCalled();
  });

  it("400s a missing address without calling the Hyperliquid service", async () => {
    const res = await GET(request());
    expect(res.status).toBe(400);
    expect(getHyperliquidAccount).not.toHaveBeenCalled();
  });

  it("400s a malformed address", async () => {
    const res = await GET(request("not-an-address"));
    expect(res.status).toBe(400);
    expect(getHyperliquidAccount).not.toHaveBeenCalled();
  });

  it("calls every service function with only the address (dex undefined) when no dex is requested, never the userId", async () => {
    await GET(request(ADDRESS));

    expect(getHyperliquidAccount).toHaveBeenCalledWith(ADDRESS, undefined);
    expect(getHyperliquidOpenOrders).toHaveBeenCalledWith(ADDRESS, undefined);
    expect(getHyperliquidUserFills).toHaveBeenCalledWith(ADDRESS, 20);
    // Explicitly confirm "user-1" (the authenticated user id) never appears
    // in any call the route makes downstream.
    for (const fn of [getHyperliquidAccount, getHyperliquidOpenOrders, getHyperliquidUserFills]) {
      for (const call of fn.mock.calls) {
        expect(call).not.toContain("user-1");
      }
    }
  });

  it("bundles all three results into one response", async () => {
    const res = await GET(request(ADDRESS));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      account: { status: "ok", account: { positions: [] } },
      openOrders: { status: "ok", orders: [] },
      fills: { status: "ok", fills: [] },
    });
  });

  // Phase 8 — a HIP-3 dex's account is a real, separate fetch, not a
  // filtered view. userFills has no dex scoping (Hyperliquid returns
  // fills across every dex by default), so it never receives dex.
  it("passes a ?dex= query param through to getHyperliquidAccount/getHyperliquidOpenOrders, but never to getHyperliquidUserFills", async () => {
    await GET(request(ADDRESS, "xyz"));

    expect(getHyperliquidAccount).toHaveBeenCalledWith(ADDRESS, "xyz");
    expect(getHyperliquidOpenOrders).toHaveBeenCalledWith(ADDRESS, "xyz");
    expect(getHyperliquidUserFills).toHaveBeenCalledWith(ADDRESS, 20);
  });
});
