import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const connectTrading212 = vi.fn();
const disconnectTrading212 = vi.fn();
const getTrading212Connection = vi.fn();
vi.mock("@/server/repositories/trading212-repository", () => ({
  connectTrading212: (...args: unknown[]) => connectTrading212(...args),
  disconnectTrading212: (...args: unknown[]) => disconnectTrading212(...args),
  getTrading212Connection: (...args: unknown[]) => getTrading212Connection(...args),
}));

import { GET, POST, DELETE } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/user/trading212", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const CONNECTED_DTO = {
  status: "CONNECTED",
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
  lastConnectedAt: "2026-09-06T00:00:00.000Z",
  lastSyncAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
});

describe("GET /api/user/trading212", () => {
  it("401s a signed-out request without ever calling the repository", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getTrading212Connection).not.toHaveBeenCalled();
  });

  it("returns the connection status for the authenticated user, sourced only from requireUserId()", async () => {
    getTrading212Connection.mockResolvedValue(CONNECTED_DTO);

    const res = await GET();
    const body = await res.json();

    expect(getTrading212Connection).toHaveBeenCalledWith("user-1");
    expect(body).toEqual({ connection: CONNECTED_DTO });
  });

  it("returns null when nothing is connected — never fabricates a connected status", async () => {
    getTrading212Connection.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ connection: null });
  });

  it("never includes any credential-shaped field in the response", async () => {
    getTrading212Connection.mockResolvedValue(CONNECTED_DTO);

    const res = await GET();
    const text = await res.text();

    expect(text).not.toMatch(/apiKey|apiSecret|encrypted/i);
  });
});

describe("POST /api/user/trading212 (connect)", () => {
  it("401s a signed-out request without ever calling the repository", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await POST(postRequest({ apiKey: "k", apiSecret: "s" }));

    expect(res.status).toBe(401);
    expect(connectTrading212).not.toHaveBeenCalled();
  });

  it("400s a missing apiKey without calling the repository", async () => {
    const res = await POST(postRequest({ apiSecret: "s" }));
    expect(res.status).toBe(400);
    expect(connectTrading212).not.toHaveBeenCalled();
  });

  it("400s a missing apiSecret without calling the repository", async () => {
    const res = await POST(postRequest({ apiKey: "k" }));
    expect(res.status).toBe(400);
    expect(connectTrading212).not.toHaveBeenCalled();
  });

  it("passes the authenticated user's id (never anything from the request body) to connectTrading212", async () => {
    connectTrading212.mockResolvedValue({ status: "connected", connection: CONNECTED_DTO });

    await POST(postRequest({ apiKey: "my-key", apiSecret: "my-secret", userId: "attacker-supplied-id" }));

    expect(connectTrading212).toHaveBeenCalledWith("user-1", "my-key", "my-secret");
  });

  it("returns the connection on success", async () => {
    connectTrading212.mockResolvedValue({ status: "connected", connection: CONNECTED_DTO });

    const res = await POST(postRequest({ apiKey: "k", apiSecret: "s" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ connection: CONNECTED_DTO });
  });

  it("400s with a safe message on invalid credentials, never persisting or leaking raw upstream text", async () => {
    connectTrading212.mockResolvedValue({
      status: "invalid_credentials",
      message: "Trading 212 rejected these credentials — double-check your API Key and API Secret.",
    });

    const res = await POST(postRequest({ apiKey: "bad", apiSecret: "bad" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/rejected these credentials/i);
  });

  it("never echoes the submitted apiKey/apiSecret back in the response", async () => {
    connectTrading212.mockResolvedValue({ status: "connected", connection: CONNECTED_DTO });

    const res = await POST(postRequest({ apiKey: "super-secret-key", apiSecret: "super-secret-value" }));
    const text = await res.text();

    expect(text).not.toContain("super-secret-key");
    expect(text).not.toContain("super-secret-value");
  });
});

describe("DELETE /api/user/trading212 (disconnect)", () => {
  it("401s a signed-out request without ever calling the repository", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(disconnectTrading212).not.toHaveBeenCalled();
  });

  it("disconnects the authenticated user's own connection", async () => {
    const res = await DELETE();
    const body = await res.json();

    expect(disconnectTrading212).toHaveBeenCalledWith("user-1");
    expect(body).toEqual({ disconnected: true });
  });
});
