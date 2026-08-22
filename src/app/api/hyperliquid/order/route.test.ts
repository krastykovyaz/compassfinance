import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const checkRateLimit = vi.fn();
const getClientKey = vi.fn();
vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientKey: (...args: unknown[]) => getClientKey(...args),
}));

const submitHyperliquidExchangeAction = vi.fn();
vi.mock("@/server/hyperliquid/service", () => ({
  submitHyperliquidExchangeAction: (...args: unknown[]) => submitHyperliquidExchangeAction(...args),
}));

import { POST } from "./route";

const ADDRESS = "0x1234567890123456789012345678901234567890";
const VALID_BODY = {
  address: ADDRESS,
  action: { type: "updateLeverage", asset: 0, isCross: true, leverage: 5 },
  nonce: 1_700_000_000_000,
  signature: { r: "0xaaa", s: "0xbbb", v: 27 },
};

function request(body: unknown) {
  return new Request("http://localhost/api/hyperliquid/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  checkRateLimit.mockReturnValue(true);
  getClientKey.mockReturnValue("1.2.3.4");
  submitHyperliquidExchangeAction.mockResolvedValue({ status: "pending" });
});

describe("POST /api/hyperliquid/order", () => {
  it("401s a signed-out request without ever calling the service", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(401);
    expect(submitHyperliquidExchangeAction).not.toHaveBeenCalled();
  });

  it("rejects (400) when rate-limited, without ever calling the service", async () => {
    checkRateLimit.mockReturnValue(false);

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(400);
    expect(submitHyperliquidExchangeAction).not.toHaveBeenCalled();
  });

  it("400s a missing/invalid address", async () => {
    const res = await POST(request({ ...VALID_BODY, address: "not-an-address" }));
    expect(res.status).toBe(400);
    expect(submitHyperliquidExchangeAction).not.toHaveBeenCalled();
  });

  it("400s a missing action", async () => {
    const res = await POST(request({ ...VALID_BODY, action: undefined }));
    expect(res.status).toBe(400);
    expect(submitHyperliquidExchangeAction).not.toHaveBeenCalled();
  });

  it("400s a missing/non-numeric nonce", async () => {
    const res = await POST(request({ ...VALID_BODY, nonce: "not-a-number" }));
    expect(res.status).toBe(400);
    expect(submitHyperliquidExchangeAction).not.toHaveBeenCalled();
  });

  it("400s a malformed signature (missing v)", async () => {
    const res = await POST(request({ ...VALID_BODY, signature: { r: "0xaaa", s: "0xbbb" } }));
    expect(res.status).toBe(400);
    expect(submitHyperliquidExchangeAction).not.toHaveBeenCalled();
  });

  it("400s unparseable JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/hyperliquid/order", { method: "POST", body: "not json" })
    );
    expect(res.status).toBe(400);
    expect(submitHyperliquidExchangeAction).not.toHaveBeenCalled();
  });

  it("calls the service with only the wallet-declared address, never the authenticated userId", async () => {
    await POST(request(VALID_BODY));

    expect(submitHyperliquidExchangeAction).toHaveBeenCalledWith(
      ADDRESS,
      VALID_BODY.action,
      VALID_BODY.nonce,
      VALID_BODY.signature
    );
    for (const call of submitHyperliquidExchangeAction.mock.calls) {
      expect(call).not.toContain("user-1");
    }
  });

  it("returns the service's real result verbatim, on success", async () => {
    submitHyperliquidExchangeAction.mockResolvedValue({ status: "resting", orderId: 12345 });

    const res = await POST(request(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ result: { status: "resting", orderId: 12345 } });
  });

  it("still returns 200 with a structured rejection when the service rejects — this route never throws for a normal validation failure", async () => {
    submitHyperliquidExchangeAction.mockResolvedValue({
      status: "rejected",
      reason: "leverage-exceeds-max",
      message: "too much",
    });

    const res = await POST(request(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.status).toBe("rejected");
  });
});
