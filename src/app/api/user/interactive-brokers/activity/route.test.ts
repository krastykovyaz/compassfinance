import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const getInteractiveBrokersActivity = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-activity-repository", () => ({
  getInteractiveBrokersActivity: (...args: unknown[]) => getInteractiveBrokersActivity(...args),
}));

import { GET } from "./route";

function request(qs = "") {
  return new NextRequest(`http://localhost/api/user/interactive-brokers/activity${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  getInteractiveBrokersActivity.mockResolvedValue({ items: [], nextCursor: null });
});

describe("GET /api/user/interactive-brokers/activity", () => {
  it("returns 401 when unauthenticated", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(getInteractiveBrokersActivity).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the session's own userId — assetId can never reach another user's data", async () => {
    await GET(request("?assetId=mcd"));

    expect(getInteractiveBrokersActivity).toHaveBeenCalledWith("user-1", {
      assetId: "mcd",
      kind: undefined,
      cursor: undefined,
      limit: undefined,
    });
  });

  it("passes through a valid kind filter", async () => {
    await GET(request("?kind=dividends"));

    expect(getInteractiveBrokersActivity).toHaveBeenCalledWith("user-1", expect.objectContaining({ kind: "dividends" }));
  });

  it("ignores an invalid/unrecognized kind value rather than passing it through unchecked", async () => {
    await GET(request("?kind=not-a-real-kind"));

    expect(getInteractiveBrokersActivity).toHaveBeenCalledWith("user-1", expect.objectContaining({ kind: undefined }));
  });

  it("passes through a cursor query param", async () => {
    await GET(request("?cursor=abc123"));

    expect(getInteractiveBrokersActivity).toHaveBeenCalledWith("user-1", expect.objectContaining({ cursor: "abc123" }));
  });

  it("parses a numeric limit query param", async () => {
    await GET(request("?limit=10"));

    expect(getInteractiveBrokersActivity).toHaveBeenCalledWith("user-1", expect.objectContaining({ limit: 10 }));
  });

  it("returns the activity page (items + nextCursor)", async () => {
    const items = [
      {
        provider: "interactive_brokers",
        kind: "execution",
        id: "ibkr-txn:9408:2026-08-12T10:00:00.000Z:-5:260:1300:execution",
        compassAssetId: null,
        assetName: "McDonald's Corp",
        rawTicker: "MCD",
        occurredAt: "2026-08-12T10:00:00.000Z",
        quantity: 5,
        price: 260,
        grossAmount: 1300,
        netAmount: null,
        fees: null,
        currency: "USD",
        orderId: null,
        externalId: "ibkr-txn:9408:2026-08-12T10:00:00.000Z:-5:260:1300",
        status: "FILLED",
        direction: "SELL",
        rawType: null,
      },
    ];
    getInteractiveBrokersActivity.mockResolvedValue({ items, nextCursor: "next-page-cursor" });

    const res = await GET(request());
    const body = await res.json();

    expect(body).toEqual({ activity: items, nextCursor: "next-page-cursor" });
  });

  it("never includes any credential-shaped field in the response", async () => {
    getInteractiveBrokersActivity.mockResolvedValue({
      items: [{ provider: "interactive_brokers", kind: "dividend", id: "x", externalId: "x" }],
      nextCursor: null,
    });

    const res = await GET(request());
    const text = await res.text();

    expect(text).not.toMatch(/accessToken|accessTokenSecret|liveSessionToken|encrypted|rsa|privateKey/i);
  });
});
