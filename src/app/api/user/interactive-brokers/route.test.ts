import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const disconnectInteractiveBrokers = vi.fn();
const getInteractiveBrokersConnection = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-repository", () => ({
  disconnectInteractiveBrokers: (...args: unknown[]) => disconnectInteractiveBrokers(...args),
  getInteractiveBrokersConnection: (...args: unknown[]) => getInteractiveBrokersConnection(...args),
}));

import { GET, DELETE } from "./route";

const CONNECTED_DTO = {
  status: "CONNECTED",
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  lastConnectedAt: "2026-09-08T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
});

describe("GET /api/user/interactive-brokers", () => {
  it("401s a signed-out request without ever calling the repository", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getInteractiveBrokersConnection).not.toHaveBeenCalled();
  });

  it("returns the connection status for the authenticated user, sourced only from requireUserId()", async () => {
    getInteractiveBrokersConnection.mockResolvedValue(CONNECTED_DTO);

    const res = await GET();
    const body = await res.json();

    expect(getInteractiveBrokersConnection).toHaveBeenCalledWith("user-1");
    expect(body).toEqual({ connection: CONNECTED_DTO });
  });

  it("returns null when nothing is connected — never fabricates a connected status", async () => {
    getInteractiveBrokersConnection.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ connection: null });
  });

  it("never includes any credential-shaped field in the response", async () => {
    getInteractiveBrokersConnection.mockResolvedValue(CONNECTED_DTO);

    const res = await GET();
    const text = await res.text();

    expect(text).not.toMatch(/accessToken|accessTokenSecret|encrypted|rsa|privateKey/i);
  });
});

describe("DELETE /api/user/interactive-brokers (disconnect)", () => {
  it("401s a signed-out request without ever calling the repository", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(disconnectInteractiveBrokers).not.toHaveBeenCalled();
  });

  it("disconnects the authenticated user's own connection", async () => {
    const res = await DELETE();
    const body = await res.json();

    expect(disconnectInteractiveBrokers).toHaveBeenCalledWith("user-1");
    expect(body).toEqual({ disconnected: true });
  });
});
