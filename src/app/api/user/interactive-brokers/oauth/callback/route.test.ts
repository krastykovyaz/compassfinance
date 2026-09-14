import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const fetchInteractiveBrokersAccessToken = vi.fn();
vi.mock("@/server/interactive-brokers/interactive-brokers-client", () => ({
  fetchInteractiveBrokersAccessToken: (...args: unknown[]) => fetchInteractiveBrokersAccessToken(...args),
}));

const decodeOAuthState = vi.fn();
vi.mock("@/server/interactive-brokers/interactive-brokers-oauth-state", () => ({
  IBKR_OAUTH_STATE_COOKIE_NAME: "ibkr_oauth_state",
  decodeOAuthState: (...args: unknown[]) => decodeOAuthState(...args),
}));

const completeInteractiveBrokersOAuthConnection = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-repository", () => ({
  completeInteractiveBrokersOAuthConnection: (...args: unknown[]) => completeInteractiveBrokersOAuthConnection(...args),
}));

import { GET } from "./route";

function request(qs: string, cookie?: string) {
  return new NextRequest(`http://localhost/api/user/interactive-brokers/oauth/callback${qs}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

const VALID_STATE = { userId: "user-1", requestToken: "req-tok", issuedAt: Date.now() };

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
  decodeOAuthState.mockReturnValue(VALID_STATE);
});

function locationOf(res: Response): string {
  return res.headers.get("location") ?? "";
}

describe("GET /api/user/interactive-brokers/oauth/callback", () => {
  it("redirects with reason=denied when oauth_token or oauth_verifier is missing (user cancelled/denied)", async () => {
    const res = await GET(request("?oauth_token=req-tok"));

    expect(locationOf(res)).toContain("ibkr=error&reason=denied");
    expect(fetchInteractiveBrokersAccessToken).not.toHaveBeenCalled();
  });

  it("redirects with reason=expired when the state cookie is missing entirely", async () => {
    const res = await GET(request("?oauth_token=req-tok&oauth_verifier=ver"));

    expect(locationOf(res)).toContain("ibkr=error&reason=expired");
    expect(fetchInteractiveBrokersAccessToken).not.toHaveBeenCalled();
  });

  it("redirects with reason=invalid_state when the cookie fails to decode (tampered/expired/wrong secret)", async () => {
    decodeOAuthState.mockReturnValue(null);

    const res = await GET(request("?oauth_token=req-tok&oauth_verifier=ver", "ibkr_oauth_state=garbage"));

    expect(locationOf(res)).toContain("ibkr=error&reason=invalid_state");
    expect(fetchInteractiveBrokersAccessToken).not.toHaveBeenCalled();
  });

  it("redirects with reason=invalid_state when the cookie's request token doesn't match the callback's oauth_token", async () => {
    decodeOAuthState.mockReturnValue({ ...VALID_STATE, requestToken: "a-different-token" });

    const res = await GET(request("?oauth_token=req-tok&oauth_verifier=ver", "ibkr_oauth_state=signed"));

    expect(locationOf(res)).toContain("ibkr=error&reason=invalid_state");
    expect(fetchInteractiveBrokersAccessToken).not.toHaveBeenCalled();
  });

  it("redirects with reason=session_expired when the browser is no longer signed in at callback time", async () => {
    const { UnauthenticatedError } = await import("@/server/auth/session");
    requireUserId.mockRejectedValue(new UnauthenticatedError());

    const res = await GET(request("?oauth_token=req-tok&oauth_verifier=ver", "ibkr_oauth_state=signed"));

    expect(locationOf(res)).toContain("ibkr=error&reason=session_expired");
    expect(fetchInteractiveBrokersAccessToken).not.toHaveBeenCalled();
  });

  it("SECURITY: rejects the callback when the currently signed-in user differs from the user who started the flow", async () => {
    requireUserId.mockResolvedValue("attacker-user");
    decodeOAuthState.mockReturnValue({ ...VALID_STATE, userId: "victim-user" });

    const res = await GET(request("?oauth_token=req-tok&oauth_verifier=ver", "ibkr_oauth_state=signed"));

    expect(locationOf(res)).toContain("ibkr=error&reason=invalid_state");
    expect(completeInteractiveBrokersOAuthConnection).not.toHaveBeenCalled();
    expect(fetchInteractiveBrokersAccessToken).not.toHaveBeenCalled();
  });

  it("redirects with reason=exchange_failed when the access-token exchange itself fails", async () => {
    fetchInteractiveBrokersAccessToken.mockResolvedValue({ ok: false, reason: "provider_error", message: "nope" });

    const res = await GET(request("?oauth_token=req-tok&oauth_verifier=ver", "ibkr_oauth_state=signed"));

    expect(locationOf(res)).toContain("ibkr=error&reason=exchange_failed");
    expect(completeInteractiveBrokersOAuthConnection).not.toHaveBeenCalled();
  });

  it("completes the connection for the authenticated user and redirects to ibkr=connected on success", async () => {
    fetchInteractiveBrokersAccessToken.mockResolvedValue({
      ok: true,
      data: { accessToken: "access-tok", accessTokenSecret: "access-secret" },
    });

    const res = await GET(request("?oauth_token=req-tok&oauth_verifier=ver", "ibkr_oauth_state=signed"));

    expect(completeInteractiveBrokersOAuthConnection).toHaveBeenCalledWith("user-1", "access-tok", "access-secret");
    expect(locationOf(res)).toContain("ibkr=connected");
  });

  it("clears the state cookie on both success and error paths", async () => {
    fetchInteractiveBrokersAccessToken.mockResolvedValue({
      ok: true,
      data: { accessToken: "access-tok", accessTokenSecret: "access-secret" },
    });

    const success = await GET(request("?oauth_token=req-tok&oauth_verifier=ver", "ibkr_oauth_state=signed"));
    expect(success.headers.get("set-cookie") ?? "").toMatch(/ibkr_oauth_state=;/);

    const failure = await GET(request("?oauth_token=req-tok"));
    expect(failure.headers.get("set-cookie") ?? "").toMatch(/ibkr_oauth_state=;/);
  });

  it("never echoes the access token or secret into the redirect URL", async () => {
    fetchInteractiveBrokersAccessToken.mockResolvedValue({
      ok: true,
      data: { accessToken: "super-secret-access-token", accessTokenSecret: "super-secret-secret" },
    });

    const res = await GET(request("?oauth_token=req-tok&oauth_verifier=ver", "ibkr_oauth_state=signed"));

    expect(locationOf(res)).not.toContain("super-secret-access-token");
    expect(locationOf(res)).not.toContain("super-secret-secret");
  });
});
