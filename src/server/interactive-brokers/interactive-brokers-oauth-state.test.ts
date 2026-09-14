import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decodeOAuthState, encodeOAuthState } from "./interactive-brokers-oauth-state";

const originalSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe("encodeOAuthState / decodeOAuthState", () => {
  it("round-trips a valid state", () => {
    const state = { userId: "user-1", requestToken: "req-token-abc", issuedAt: Date.now() };

    const decoded = decodeOAuthState(encodeOAuthState(state));

    expect(decoded).toEqual(state);
  });

  it("rejects a tampered payload (userId swapped after signing)", () => {
    const cookie = encodeOAuthState({ userId: "user-1", requestToken: "req-token-abc", issuedAt: Date.now() });
    const [, signature] = cookie.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ userId: "attacker", requestToken: "req-token-abc", issuedAt: Date.now() }),
      "utf8"
    ).toString("base64url");

    expect(decodeOAuthState(`${tamperedPayload}.${signature}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const cookie = encodeOAuthState({ userId: "user-1", requestToken: "req-token-abc", issuedAt: Date.now() });
    const [payloadB64] = cookie.split(".");

    expect(decodeOAuthState(`${payloadB64}.not-a-real-signature`)).toBeNull();
  });

  it("rejects a value signed with a different secret", () => {
    const cookie = encodeOAuthState({ userId: "user-1", requestToken: "req-token-abc", issuedAt: Date.now() });

    process.env.AUTH_SECRET = "a-different-secret";

    expect(decodeOAuthState(cookie)).toBeNull();
  });

  it("rejects an expired state", () => {
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    const cookie = encodeOAuthState({ userId: "user-1", requestToken: "req-token-abc", issuedAt: elevenMinutesAgo });

    expect(decodeOAuthState(cookie)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(decodeOAuthState("not-a-valid-cookie-value")).toBeNull();
    expect(decodeOAuthState("")).toBeNull();
    expect(decodeOAuthState("a.b.c")).toBeNull();
  });

  it("throws a clear error rather than silently signing with an empty key when AUTH_SECRET is unset", () => {
    delete process.env.AUTH_SECRET;

    expect(() => encodeOAuthState({ userId: "user-1", requestToken: "req-token-abc", issuedAt: Date.now() })).toThrow(
      /AUTH_SECRET/
    );
  });
});
