import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const getTrading212Activity = vi.fn();
vi.mock("@/server/repositories/trading212-activity-repository", () => ({
  getTrading212Activity: (...args: unknown[]) => getTrading212Activity(...args),
}));

import { GET } from "./route";

function request(qs = "") {
  return new NextRequest(`http://localhost/api/user/trading212/activity${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  getTrading212Activity.mockResolvedValue({ items: [], nextCursor: null });
});

describe("GET /api/user/trading212/activity", () => {
  it("returns 401 when unauthenticated", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET(request());

    expect(res.status).toBe(401);
  });

  it("scopes the lookup to the session's own userId — assetId can never reach another user's data", async () => {
    await GET(request("?assetId=aapl"));

    expect(getTrading212Activity).toHaveBeenCalledWith("user-1", {
      assetId: "aapl",
      kind: undefined,
      cursor: undefined,
      limit: undefined,
    });
  });

  it("passes no assetId/kind/cursor filter when omitted", async () => {
    await GET(request());

    expect(getTrading212Activity).toHaveBeenCalledWith("user-1", {
      assetId: undefined,
      kind: undefined,
      cursor: undefined,
      limit: undefined,
    });
  });

  it("parses a numeric limit query param", async () => {
    await GET(request("?limit=10"));

    expect(getTrading212Activity).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ limit: 10 })
    );
  });

  it("passes through a valid kind filter", async () => {
    await GET(request("?kind=dividends"));

    expect(getTrading212Activity).toHaveBeenCalledWith("user-1", expect.objectContaining({ kind: "dividends" }));
  });

  it("ignores an invalid/unrecognized kind value rather than passing it through unchecked", async () => {
    await GET(request("?kind=not-a-real-kind"));

    expect(getTrading212Activity).toHaveBeenCalledWith("user-1", expect.objectContaining({ kind: undefined }));
  });

  it("passes through a cursor query param — never trusted for anything but this same userId's own paginated query", async () => {
    await GET(request("?cursor=abc123"));

    expect(getTrading212Activity).toHaveBeenCalledWith("user-1", expect.objectContaining({ cursor: "abc123" }));
  });

  it("returns the activity page (items + nextCursor)", async () => {
    const items = [
      {
        provider: "trading212",
        kind: "execution",
        id: "order-1:execution",
        compassAssetId: "aapl",
        assetName: "Apple Inc.",
        rawTicker: "AAPL_US_EQ",
        occurredAt: "2026-08-12T10:00:00.000Z",
        quantity: 10,
        price: 181.42,
        grossAmount: 1814.2,
        netAmount: null,
        fees: null,
        currency: "USD",
        orderId: "order-1",
        externalId: "order-1",
        status: "FILLED",
        direction: "BUY",
        rawType: null,
      },
    ];
    getTrading212Activity.mockResolvedValue({ items, nextCursor: "next-page-cursor" });

    const res = await GET(request());
    const body = await res.json();

    expect(body).toEqual({ activity: items, nextCursor: "next-page-cursor" });
  });
});
