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

function request(address?: string) {
  const url = address
    ? `http://localhost/api/hyperliquid/account?address=${address}`
    : "http://localhost/api/hyperliquid/account";
  return new Request(url);
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

  it("calls every service function with only the address, never the userId", async () => {
    await GET(request(ADDRESS));

    expect(getHyperliquidAccount).toHaveBeenCalledWith(ADDRESS);
    expect(getHyperliquidOpenOrders).toHaveBeenCalledWith(ADDRESS);
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
});
