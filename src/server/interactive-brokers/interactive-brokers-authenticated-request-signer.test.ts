import { describe, expect, it, vi } from "vitest";
import { createHmac, randomBytes } from "crypto";

vi.mock("server-only", () => ({}));

import { buildAuthenticatedRequestAuthorizationHeader } from "./interactive-brokers-authenticated-request-signer";
import { buildSignatureBaseString } from "./interactive-brokers-oauth-signer";

function parseAuthorizationHeader(header: string): Record<string, string> {
  const withoutScheme = header.replace(/^OAuth /, "");
  const params: Record<string, string> = {};
  for (const part of withoutScheme.split(", ")) {
    const match = part.match(/^([^=]+)="(.*)"$/);
    if (!match) continue;
    params[decodeURIComponent(match[1])] = decodeURIComponent(match[2]);
  }
  return params;
}

const liveSessionToken = randomBytes(20).toString("base64");

describe("buildAuthenticatedRequestAuthorizationHeader", () => {
  it("signs with HMAC-SHA256 keyed by the (base64-decoded) Live Session Token", () => {
    const method = "GET";
    const url = "https://api.ibkr.com/v1/api/portfolio/accounts";

    const header = buildAuthenticatedRequestAuthorizationHeader({
      method,
      url,
      consumerKey: "test-consumer-key",
      accessToken: "access-tok",
      liveSessionToken,
      realm: "limited_poa",
    });

    const params = parseAuthorizationHeader(header);
    expect(params.oauth_signature_method).toBe("HMAC-SHA256");
    expect(params.oauth_token).toBe("access-tok");
    expect(params.realm).toBe("limited_poa");
    expect(params).not.toHaveProperty("oauth_verifier");

    const { oauth_signature, ...signedParams } = params;
    const baseString = buildSignatureBaseString(method, url, signedParams);
    const expectedSignature = createHmac("sha256", Buffer.from(liveSessionToken, "base64"))
      .update(baseString, "utf8")
      .digest("base64");
    expect(oauth_signature).toBe(expectedSignature);
  });

  it("never produces the same signature twice for the same logical request (fresh nonce/timestamp)", () => {
    const args = {
      method: "GET",
      url: "https://api.ibkr.com/v1/api/portfolio/accounts",
      consumerKey: "test-consumer-key",
      accessToken: "access-tok",
      liveSessionToken,
      realm: "limited_poa",
    };

    const first = parseAuthorizationHeader(buildAuthenticatedRequestAuthorizationHeader(args));
    const second = parseAuthorizationHeader(buildAuthenticatedRequestAuthorizationHeader(args));

    expect(first.oauth_nonce).not.toBe(second.oauth_nonce);
    expect(first.oauth_signature).not.toBe(second.oauth_signature);
  });

  it("never leaks the Live Session Token itself into the header", () => {
    const header = buildAuthenticatedRequestAuthorizationHeader({
      method: "GET",
      url: "https://api.ibkr.com/v1/api/portfolio/accounts",
      consumerKey: "test-consumer-key",
      accessToken: "access-tok",
      liveSessionToken,
      realm: "limited_poa",
    });

    expect(header).not.toContain(liveSessionToken);
  });
});
