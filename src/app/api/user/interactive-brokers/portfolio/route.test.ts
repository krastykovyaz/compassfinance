import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const getInteractiveBrokersPortfolio = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-portfolio-repository", () => ({
  getInteractiveBrokersPortfolio: (...args: unknown[]) => getInteractiveBrokersPortfolio(...args),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
});

describe("GET /api/user/interactive-brokers/portfolio", () => {
  it("returns 401 when unauthenticated", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("scopes the lookup to the session's own userId", async () => {
    getInteractiveBrokersPortfolio.mockResolvedValue(null);

    await GET();

    expect(getInteractiveBrokersPortfolio).toHaveBeenCalledWith("user-1");
  });

  it("returns null when there's no connection", async () => {
    getInteractiveBrokersPortfolio.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ portfolio: null });
  });

  it("returns the account/positions payload when connected and synced", async () => {
    const portfolio = {
      accountId: "U1234567",
      account: { currencyCode: "USD", totalValue: 10000, cashAvailable: 2000, investedValue: 8000, realizedPnl: 0, unrealizedPnl: 500 },
      positions: [
        {
          compassAssetId: null,
          externalId: "9408",
          externalTicker: "MCD",
          externalName: null,
          currencyCode: "USD",
          quantity: 12,
          averagePrice: 266.2,
          currentPrice: 258.83,
          unrealizedPnl: 88.55,
          realizedPnl: 0,
          assetClass: "STK",
          sector: "Consumer, Cyclical",
          expiry: null,
          strike: null,
          multiplier: null,
          underlyingConid: null,
        },
      ],
      lastSyncAt: "2026-09-08T10:00:00.000Z",
      syncStatus: "SYNCED",
      syncError: null,
      lastFailedSyncAt: null,
      connectionStatus: "CONNECTED",
    };
    getInteractiveBrokersPortfolio.mockResolvedValue(portfolio);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ portfolio });
  });

  it("never includes any credential-shaped field in the response", async () => {
    getInteractiveBrokersPortfolio.mockResolvedValue({
      accountId: "U1",
      account: null,
      positions: [],
      lastSyncAt: null,
      syncStatus: "NEVER_SYNCED",
      syncError: null,
      lastFailedSyncAt: null,
      connectionStatus: "CONNECTED",
    });

    const res = await GET();
    const text = await res.text();

    expect(text).not.toMatch(/accessToken|accessTokenSecret|encrypted|liveSessionToken|rsa|privateKey/i);
  });
});
