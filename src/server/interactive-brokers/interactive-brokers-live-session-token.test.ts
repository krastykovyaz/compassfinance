import { describe, expect, it, vi } from "vitest";
import { createHmac, generateKeyPairSync, publicEncrypt, constants as cryptoConstants, createVerify } from "crypto";

vi.mock("server-only", () => ({}));

import {
  buildLiveSessionTokenRequestAuthorizationHeader,
  computeDiffieHellmanChallenge,
  decryptAccessTokenSecret,
  deriveLiveSessionToken,
  generateDhRandom,
  modPow,
  verifyLiveSessionToken,
} from "./interactive-brokers-live-session-token";
import { buildSignatureBaseString } from "./interactive-brokers-oauth-signer";

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

describe("modPow", () => {
  it("computes correct modular exponentiation for small values", () => {
    expect(modPow(BigInt(2), BigInt(10), BigInt(1000))).toBe(BigInt(24)); // 1024 % 1000
    expect(modPow(BigInt(5), BigInt(0), BigInt(97))).toBe(BigInt(1));
    expect(modPow(BigInt(7), BigInt(1), BigInt(13))).toBe(BigInt(7) % BigInt(13));
  });

  it("satisfies the Diffie-Hellman commutativity property both sides rely on", () => {
    const p = BigInt(23);
    const g = BigInt(5);
    const a = BigInt(6);
    const b = BigInt(15);

    const A = modPow(g, a, p);
    const B = modPow(g, b, p);
    const sharedFromA = modPow(B, a, p);
    const sharedFromB = modPow(A, b, p);

    expect(sharedFromA).toBe(sharedFromB);
  });
});

describe("generateDhRandom", () => {
  it("produces a different value on every call", () => {
    expect(generateDhRandom()).not.toBe(generateDhRandom());
  });

  it("produces a positive bigint within 256 bits", () => {
    const value = generateDhRandom();
    expect(value).toBeGreaterThan(BigInt(0));
    expect(value).toBeLessThan(BigInt(2) ** BigInt(256));
  });
});

describe("computeDiffieHellmanChallenge", () => {
  it("returns generator^dhRandom mod prime as lowercase hex with no 0x prefix", () => {
    const challenge = computeDiffieHellmanChallenge(BigInt(6), BigInt(5), BigInt(23));
    const expected = modPow(BigInt(5), BigInt(6), BigInt(23)).toString(16);
    expect(challenge).toBe(expected);
    expect(challenge).not.toMatch(/^0x/);
    expect(challenge).toBe(challenge.toLowerCase());
  });
});

describe("decryptAccessTokenSecret", () => {
  it("round-trips a PKCS#1 v1.5-encrypted secret back to its original hex", () => {
    const originalSecretBytes = Buffer.from("deadbeefcafef00d", "hex");
    const ciphertext = publicEncrypt(
      { key: publicKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
      originalSecretBytes
    );
    const accessTokenSecretBase64 = ciphertext.toString("base64");

    const prepend = decryptAccessTokenSecret(accessTokenSecretBase64, privateKey);

    expect(prepend).toBe("deadbeefcafef00d");
  });

  it("throws rather than returning garbage when decrypted with the wrong key", () => {
    const { publicKey: otherPublicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const ciphertext = publicEncrypt(
      { key: otherPublicKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from("deadbeef", "hex")
    );

    expect(() => decryptAccessTokenSecret(ciphertext.toString("base64"), privateKey)).toThrow(/PKCS#1/);
  });
});

describe("buildLiveSessionTokenRequestAuthorizationHeader", () => {
  it("produces a header whose signature verifies against prepend + the standard base string", () => {
    const method = "POST";
    const url = "https://api.ibkr.com/v1/api/oauth/live_session_token";
    const prependHex = "abcd1234";

    const header = buildLiveSessionTokenRequestAuthorizationHeader({
      method,
      url,
      consumerKey: "test-consumer-key",
      signingKeyPem: privateKey,
      accessToken: "access-tok",
      dhChallenge: "deadbeef",
      prependHex,
      realm: "limited_poa",
    });

    const params = parseAuthorizationHeader(header);
    expect(params.oauth_signature_method).toBe("RSA-SHA256");
    expect(params.oauth_token).toBe("access-tok");
    expect(params.diffie_hellman_challenge).toBe("deadbeef");
    expect(params.realm).toBe("limited_poa");

    const { oauth_signature, ...signedParams } = params;
    const baseString = prependHex + buildSignatureBaseString(method, url, signedParams);
    const verifier = createVerify("RSA-SHA256");
    verifier.update(baseString, "utf8");
    verifier.end();
    expect(verifier.verify(publicKey, oauth_signature, "base64")).toBe(true);
  });

  it("never leaks the prepend (decrypted secret material) as its own header field", () => {
    const header = buildLiveSessionTokenRequestAuthorizationHeader({
      method: "POST",
      url: "https://api.ibkr.com/v1/api/oauth/live_session_token",
      consumerKey: "test-consumer-key",
      signingKeyPem: privateKey,
      accessToken: "access-tok",
      dhChallenge: "deadbeef",
      prependHex: "secretprependvalue",
      realm: "limited_poa",
    });

    const params = parseAuthorizationHeader(header);
    expect(Object.keys(params)).not.toContain("prepend");
  });
});

describe("deriveLiveSessionToken", () => {
  it("prepends a zero byte to the DH shared secret when its top bit is set (sign-bit padding)", () => {
    // dhRandom = 1 makes the shared secret exactly dhResponse itself
    // (dhResponse^1 mod prime = dhResponse, since dhResponse < prime) —
    // a deterministic way to force a specific K value for this test.
    const dhPrime = (BigInt(1) << BigInt(256)) - BigInt(189); // an arbitrarily large modulus, bigger than any test dhResponse below
    const prependHex = "cafebabe";

    const lstWithPadding = deriveLiveSessionToken({
      dhRandom: BigInt(1),
      dhResponseHex: "ff", // top bit set
      dhPrime,
      prependHex,
    });
    const expectedWithPadding = createHmac("sha1", Buffer.from([0x00, 0xff]))
      .update(Buffer.from(prependHex, "hex"))
      .digest("base64");
    expect(lstWithPadding).toBe(expectedWithPadding);

    const lstWithoutPadding = deriveLiveSessionToken({
      dhRandom: BigInt(1),
      dhResponseHex: "7f", // top bit not set
      dhPrime,
      prependHex,
    });
    const expectedWithoutPadding = createHmac("sha1", Buffer.from([0x7f]))
      .update(Buffer.from(prependHex, "hex"))
      .digest("base64");
    expect(lstWithoutPadding).toBe(expectedWithoutPadding);
  });

  it("is deterministic for the same inputs", () => {
    const args = {
      dhRandom: BigInt(42),
      dhResponseHex: "1234abcd",
      dhPrime: (BigInt(1) << BigInt(512)) - BigInt(1),
      prependHex: "aa",
    };
    expect(deriveLiveSessionToken(args)).toBe(deriveLiveSessionToken(args));
  });

  it("both sides of a real Diffie-Hellman exchange derive the same LST", () => {
    // Simulates the client and IBKR's server independently computing the
    // same shared secret from their own private exponent + the other
    // side's public value — the actual security property this whole
    // derivation depends on.
    const prime = (BigInt(1) << BigInt(256)) - BigInt(189); // a large modulus for this test
    const generator = BigInt(2);
    const clientRandom = BigInt(12345);
    const serverRandom = BigInt(67890);

    const clientChallenge = modPow(generator, clientRandom, prime); // sent to "IBKR"
    const serverResponse = modPow(generator, serverRandom, prime); // "IBKR"'s reply

    // Client's view: K = serverResponse^clientRandom mod prime
    const prependHex = "abc123";
    const clientLst = deriveLiveSessionToken({
      dhRandom: clientRandom,
      dhResponseHex: serverResponse.toString(16),
      dhPrime: prime,
      prependHex,
    });

    // "Server"'s view: K = clientChallenge^serverRandom mod prime — must
    // equal the client's K, so re-deriving with dhRandom/dhResponse
    // swapped must produce the identical LST.
    const serverLst = deriveLiveSessionToken({
      dhRandom: serverRandom,
      dhResponseHex: clientChallenge.toString(16),
      dhPrime: prime,
      prependHex,
    });

    expect(clientLst).toBe(serverLst);
  });
});

describe("verifyLiveSessionToken", () => {
  it("accepts a signature computed the same way IBKR's own docs describe", () => {
    const lst = Buffer.from("some-lst-bytes").toString("base64");
    const consumerKey = "test-consumer-key";
    const lstSignatureHex = createHmac("sha1", Buffer.from(lst, "base64")).update(consumerKey, "utf8").digest("hex");

    expect(verifyLiveSessionToken(lst, consumerKey, lstSignatureHex)).toBe(true);
  });

  it("rejects a mismatched signature — the derivation must never be trusted on a mismatch", () => {
    const lst = Buffer.from("some-lst-bytes").toString("base64");
    expect(verifyLiveSessionToken(lst, "test-consumer-key", "0".repeat(40))).toBe(false);
  });

  it("rejects when the consumer key used for verification differs from the one IBKR signed for", () => {
    const lst = Buffer.from("some-lst-bytes").toString("base64");
    const lstSignatureHex = createHmac("sha1", Buffer.from(lst, "base64")).update("real-consumer-key", "utf8").digest("hex");

    expect(verifyLiveSessionToken(lst, "wrong-consumer-key", lstSignatureHex)).toBe(false);
  });
});
