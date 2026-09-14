import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const fetchInteractiveBrokersRequestToken = vi.fn();
const getInteractiveBrokersAuthorizeUrl = vi.fn();
vi.mock("@/server/interactive-brokers/interactive-brokers-client", () => ({
  fetchInteractiveBrokersRequestToken: (...args: unknown[]) => fetchInteractiveBrokersRequestToken(...args),
  getInteractiveBrokersAuthorizeUrl: (...args: unknown[]) => getInteractiveBrokersAuthorizeUrl(...args),
}));

const encodeOAuthState = vi.fn();
vi.mock("@/server/interactive-brokers/interactive-brokers-oauth-state", () => ({
  IBKR_OAUTH_STATE_COOKIE_NAME: "ibkr_oauth_state",
  IBKR_OAUTH_STATE_MAX_AGE_SECONDS: 600,
  encodeOAuthState: (...args: unknown[]) => encodeOAuthState(...args),
}));

import { GET } from "./route";

function request() {
  return new NextRequest("http://localhost/api/user/interactive-brokers/oauth/start");
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  encodeOAuthState.mockReturnValue("signed-state-cookie-value");
  getInteractiveBrokersAuthorizeUrl.mockReturnValue("https://interactivebrokers.com/authorize?oauth_token=req-tok");
});

describe("GET /api/user/interactive-brokers/oauth/start", () => {
  it("redirects a signed-out request to sign-in without calling Interactive Brokers", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET(request());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/signin");
    expect(fetchInteractiveBrokersRequestToken).not.toHaveBeenCalled();
  });

  it("redirects to Interactive Brokers' own authorize URL on success, with the state cookie set", async () => {
    fetchInteractiveBrokersRequestToken.mockResolvedValue({ ok: true, data: { requestToken: "req-tok" } });

    const res = await GET(request());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://interactivebrokers.com/authorize?oauth_token=req-tok");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("ibkr_oauth_state=signed-state-cookie-value");
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("encodes the state cookie with the authenticated userId and the real request token — never anything client-supplied", async () => {
    fetchInteractiveBrokersRequestToken.mockResolvedValue({ ok: true, data: { requestToken: "req-tok" } });

    await GET(request());

    expect(encodeOAuthState).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", requestToken: "req-tok" })
    );
  });

  it("redirects back into the app with reason=not_configured when Interactive Brokers isn't configured yet", async () => {
    fetchInteractiveBrokersRequestToken.mockResolvedValue({
      ok: false,
      reason: "not_configured",
      message: "Interactive Brokers integration is not configured",
    });

    const res = await GET(request());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/profile/connected-accounts?ibkr=error&reason=not_configured");
    expect(encodeOAuthState).not.toHaveBeenCalled();
  });

  it("redirects back with a generic failure reason on any other provider fetch failure", async () => {
    fetchInteractiveBrokersRequestToken.mockResolvedValue({
      ok: false,
      reason: "network_error",
      message: "Couldn't reach Interactive Brokers",
    });

    const res = await GET(request());

    expect(res.headers.get("location")).toContain("reason=start_failed");
  });
});
