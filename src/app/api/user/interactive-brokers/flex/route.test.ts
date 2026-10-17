import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

const requestFlexReport = vi.fn();
vi.mock("@/server/interactive-brokers/interactive-brokers-flex-client", () => ({
  requestFlexReport: (...args: unknown[]) => requestFlexReport(...args),
}));

const connectInteractiveBrokersFlex = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-repository", () => ({
  connectInteractiveBrokersFlex: (...args: unknown[]) => connectInteractiveBrokersFlex(...args),
}));

import { POST } from "./route";

const DTO = { status: "CONNECTED", method: "flex", createdAt: "x", updatedAt: "x", lastConnectedAt: "x" };

function request(body: unknown) {
  return new Request("http://localhost/api/user/interactive-brokers/flex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  checkRateLimit.mockReturnValue(true);
  requestFlexReport.mockResolvedValue({ ok: true, data: { referenceCode: "1" } });
  connectInteractiveBrokersFlex.mockResolvedValue(DTO);
});

describe("POST /api/user/interactive-brokers/flex", () => {
  it("401s a signed-out request before touching Interactive Brokers", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await POST(request({ token: "TOKEN12345", queryId: "1" }));

    expect(res.status).toBe(401);
    expect(requestFlexReport).not.toHaveBeenCalled();
  });

  it("rate-limits per signed-in user before making a real request to Interactive Brokers", async () => {
    checkRateLimit.mockReturnValue(false);

    const res = await POST(request({ token: "TOKEN12345", queryId: "1" }));

    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("ibkr-flex-connect:user-1");
    expect(requestFlexReport).not.toHaveBeenCalled();
  });

  it.each([
    [{ queryId: "1" }, "missing token"],
    [{ token: "short", queryId: "1" }, "token too short"],
    [{ token: "TOKEN 12345", queryId: "1" }, "token with a space"],
    [{ token: "TOKEN12345" }, "missing query id"],
    [{ token: "TOKEN12345", queryId: "abc" }, "non-numeric query id"],
    [{ token: "TOKEN12345", queryId: "1234567890123" }, "query id too long"],
    [{ token: 12345678, queryId: "1" }, "token not a string"],
  ])("rejects %j (%s) without calling Interactive Brokers or storing anything", async (body, _reason) => {
    void _reason;
    const res = await POST(request(body));

    expect(res.status).toBe(400);
    expect(requestFlexReport).not.toHaveBeenCalled();
    expect(connectInteractiveBrokersFlex).not.toHaveBeenCalled();
  });

  it("stores nothing when Interactive Brokers rejects the pair, and shows its fixed message", async () => {
    requestFlexReport.mockResolvedValue({ ok: false, reason: "invalid_token", message: "Interactive Brokers rejected this Flex token." });

    const res = await POST(request({ token: "TOKEN12345", queryId: "1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Interactive Brokers rejected this Flex token.");
    expect(connectInteractiveBrokersFlex).not.toHaveBeenCalled();
  });

  it("stores the trimmed pair for the session's user once Interactive Brokers accepts it, and returns no credential", async () => {
    const res = await POST(request({ token: "  TOKEN12345  ", queryId: " 424242 " }));
    const body = await res.json();

    expect(requestFlexReport).toHaveBeenCalledWith({ token: "TOKEN12345", queryId: "424242" });
    expect(connectInteractiveBrokersFlex).toHaveBeenCalledWith("user-1", { token: "TOKEN12345", queryId: "424242" });
    expect(body).toEqual({ connection: DTO });
    expect(JSON.stringify(body)).not.toContain("TOKEN12345");
  });

  it("never reads the user id from the request body", async () => {
    await POST(request({ token: "TOKEN12345", queryId: "1", userId: "attacker" }));

    expect(connectInteractiveBrokersFlex).toHaveBeenCalledWith("user-1", expect.anything());
  });
});
