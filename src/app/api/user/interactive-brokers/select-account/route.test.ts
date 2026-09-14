import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const discoverInteractiveBrokersAccounts = vi.fn();
vi.mock("@/server/interactive-brokers/interactive-brokers-sync", () => ({
  discoverInteractiveBrokersAccounts: (...args: unknown[]) => discoverInteractiveBrokersAccounts(...args),
}));

const setInteractiveBrokersSelectedAccount = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-repository", () => ({
  setInteractiveBrokersSelectedAccount: (...args: unknown[]) => setInteractiveBrokersSelectedAccount(...args),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/user/interactive-brokers/select-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const CANDIDATES = [
  { accountId: "U1234567", currency: "USD", type: "LIVE", clearingStatus: "O", accountTitle: null, accountAlias: null },
  { accountId: "U7654321", currency: "USD", type: "DEMO", clearingStatus: "O", accountTitle: null, accountAlias: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  discoverInteractiveBrokersAccounts.mockResolvedValue({ ok: true, accounts: CANDIDATES, authCredentials: {} });
});

describe("POST /api/user/interactive-brokers/select-account", () => {
  it("401s a signed-out request without ever calling discovery", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await POST(request({ accountId: "U1234567" }));

    expect(res.status).toBe(401);
    expect(discoverInteractiveBrokersAccounts).not.toHaveBeenCalled();
  });

  it("400s a missing accountId without calling discovery", async () => {
    const res = await POST(request({}));

    expect(res.status).toBe(400);
    expect(discoverInteractiveBrokersAccounts).not.toHaveBeenCalled();
  });

  it("persists the chosen account for the authenticated user when it is among the freshly-discovered accounts", async () => {
    const res = await POST(request({ accountId: "U7654321", userId: "attacker-supplied-id" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(setInteractiveBrokersSelectedAccount).toHaveBeenCalledWith("user-1", "U7654321");
    expect(body).toEqual({ selected: "U7654321" });
  });

  it("SECURITY: rejects an accountId that isn't among the freshly-discovered accounts, never trusting the client's value outright", async () => {
    const res = await POST(request({ accountId: "U-fabricated" }));

    expect(res.status).toBe(400);
    expect(setInteractiveBrokersSelectedAccount).not.toHaveBeenCalled();
  });

  it("400s with discovery's own safe message when discovery itself fails", async () => {
    discoverInteractiveBrokersAccounts.mockResolvedValue({ ok: false, reason: "network_error", message: "Couldn't reach Interactive Brokers" });

    const res = await POST(request({ accountId: "U1234567" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/couldn't reach/i);
    expect(setInteractiveBrokersSelectedAccount).not.toHaveBeenCalled();
  });
});
