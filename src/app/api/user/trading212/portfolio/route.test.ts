import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const getTrading212Portfolio = vi.fn();
vi.mock("@/server/repositories/trading212-portfolio-repository", () => ({
  getTrading212Portfolio: (...args: unknown[]) => getTrading212Portfolio(...args),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
});

describe("GET /api/user/trading212/portfolio", () => {
  it("returns 401 when unauthenticated", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("scopes the lookup to the session's own userId", async () => {
    getTrading212Portfolio.mockResolvedValue(null);

    await GET();

    expect(getTrading212Portfolio).toHaveBeenCalledWith("user-1");
  });

  it("returns null when there's no connection", async () => {
    getTrading212Portfolio.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ portfolio: null });
  });

  it("returns the account/positions payload when connected and synced", async () => {
    const portfolio = {
      account: { currencyCode: "USD", totalValue: 1000, cashAvailable: 100, cashInPies: null, cashReserved: null, investedValue: 900, realizedPnl: null, unrealizedPnl: 50 },
      positions: [{ compassAssetId: "aapl", externalTicker: "AAPL_US_EQ", externalName: "Apple Inc.", currencyCode: "USD", quantity: 10, averagePrice: 150, currentPrice: 181.42, unrealizedPnl: 314.2 }],
    };
    getTrading212Portfolio.mockResolvedValue(portfolio);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ portfolio });
  });
});
