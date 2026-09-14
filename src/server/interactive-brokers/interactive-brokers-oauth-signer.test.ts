import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "crypto";

vi.mock("server-only", () => ({}));

import {
  buildOAuthAuthorizationHeader,
  buildSignatureBaseString,
  generateNonce,
  percentEncode,
} from "./interactive-brokers-oauth-signer";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

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

describe("percentEncode", () => {
  it("encodes RFC 3986 reserved characters that encodeURIComponent leaves alone", () => {
    expect(percentEncode("!*'()")).toBe("%21%2A%27%28%29");
  });

  it("encodes spaces as %20, not +", () => {
    expect(percentEncode("a b")).toBe("a%20b");
  });

  it("leaves unreserved characters untouched", () => {
    expect(percentEncode("abc123-._~")).toBe("abc123-._~");
  });
});

describe("generateNonce", () => {
  it("produces a different value on every call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe("buildSignatureBaseString", () => {
  it("sorts params by key, joins with &, and percent-encodes the whole parameter string", () => {
    const baseString = buildSignatureBaseString("POST", "https://api.ibkr.com/v1/api/oauth/request_token", {
      oauth_consumer_key: "my key",
      oauth_nonce: "abc",
    });

    expect(baseString).toBe(
      "POST&https%3A%2F%2Fapi.ibkr.com%2Fv1%2Fapi%2Foauth%2Frequest_token&oauth_consumer_key%3Dmy%2520key%26oauth_nonce%3Dabc"
    );
  });
});

describe("buildOAuthAuthorizationHeader", () => {
  it("produces a signature that verifies against the exact base string with the matching public key", () => {
    const method = "POST";
    const url = "https://api.ibkr.com/v1/api/oauth/request_token";

    const header = buildOAuthAuthorizationHeader({
      method,
      url,
      consumerKey: "test-consumer-key",
      privateKeyPem: privateKey,
    });

    const params = parseAuthorizationHeader(header);
    expect(params.oauth_signature_method).toBe("RSA-SHA256");
    expect(params.oauth_version).toBe("1.0");
    expect(params.oauth_consumer_key).toBe("test-consumer-key");
    expect(params.oauth_token).toBeUndefined();
    expect(params.oauth_verifier).toBeUndefined();

    const { oauth_signature, ...signedParams } = params;
    const baseString = buildSignatureBaseString(method, url, signedParams);
    const verifier = createVerify("RSA-SHA256");
    verifier.update(baseString, "utf8");
    verifier.end();
    expect(verifier.verify(publicKey, oauth_signature, "base64")).toBe(true);
  });

  it("includes oauth_token and oauth_verifier, and still produces a verifiable signature, for the access-token exchange", () => {
    const method = "POST";
    const url = "https://api.ibkr.com/v1/api/oauth/access_token";

    const header = buildOAuthAuthorizationHeader({
      method,
      url,
      consumerKey: "test-consumer-key",
      privateKeyPem: privateKey,
      token: "request-token-abc",
      verifier: "verifier-xyz",
    });

    const params = parseAuthorizationHeader(header);
    expect(params.oauth_token).toBe("request-token-abc");
    expect(params.oauth_verifier).toBe("verifier-xyz");

    const { oauth_signature, ...signedParams } = params;
    const baseString = buildSignatureBaseString(method, url, signedParams);
    const verifier = createVerify("RSA-SHA256");
    verifier.update(baseString, "utf8");
    verifier.end();
    expect(verifier.verify(publicKey, oauth_signature, "base64")).toBe(true);
  });

  it("never produces the same signature twice for the same logical request (fresh nonce/timestamp each call)", () => {
    const args = {
      method: "POST",
      url: "https://api.ibkr.com/v1/api/oauth/request_token",
      consumerKey: "test-consumer-key",
      privateKeyPem: privateKey,
    };

    const first = parseAuthorizationHeader(buildOAuthAuthorizationHeader(args));
    const second = parseAuthorizationHeader(buildOAuthAuthorizationHeader(args));

    expect(first.oauth_nonce).not.toBe(second.oauth_nonce);
    expect(first.oauth_signature).not.toBe(second.oauth_signature);
  });

  it("never leaks the private key material itself into the header", () => {
    const header = buildOAuthAuthorizationHeader({
      method: "POST",
      url: "https://api.ibkr.com/v1/api/oauth/request_token",
      consumerKey: "test-consumer-key",
      privateKeyPem: privateKey,
    });

    expect(header).not.toContain("PRIVATE KEY");
  });
});
