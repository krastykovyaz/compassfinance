import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { encrypt, decrypt } from "./encryption";

// A real 32-byte key, base64-encoded — same format the module itself
// expects and the same generation command its own error message suggests
// (openssl rand -base64 32), just fixed here for determinism.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  // Assigning `undefined` to a process.env key stores the literal string
  // "undefined" instead of deleting it (a real Node.js process.env
  // gotcha) — delete outright when there was nothing to restore, since
  // this env var is genuinely unset outside these tests.
  if (originalKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  else process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
});

describe("encrypt/decrypt", () => {
  it("round-trips a plaintext string exactly", () => {
    const plaintext = "my-trading212-api-key-abc123";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("round-trips empty and unicode strings too", () => {
    expect(decrypt(encrypt(""))).toBe("");
    expect(decrypt(encrypt("秘密のAPIキー 🔒"))).toBe("秘密のAPIキー 🔒");
  });

  it("never stores the plaintext anywhere in the ciphertext string", () => {
    const plaintext = "super-secret-value-should-not-appear-verbatim";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
  });

  it("produces a different ciphertext each time for the same plaintext (random IV per call)", () => {
    const plaintext = "same-input-every-time";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("fails to decrypt with the wrong key — never silently returns garbage as if it succeeded", () => {
    const ciphertext = encrypt("secret");
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decrypt(ciphertext)).toThrow();
  });

  it("fails to decrypt tampered ciphertext — GCM's authentication check catches it", () => {
    const ciphertext = encrypt("secret");
    const [iv, authTag, data] = ciphertext.split(".");
    const tamperedByte = Buffer.from(data, "base64");
    tamperedByte[0] = tamperedByte[0] ^ 0xff;
    const tampered = [iv, authTag, tamperedByte.toString("base64")].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws a clear error when CREDENTIALS_ENCRYPTION_KEY is missing — never falls back to an insecure default", () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encrypt("secret")).toThrow(/CREDENTIALS_ENCRYPTION_KEY is not set/);
  });

  it("throws a clear error when CREDENTIALS_ENCRYPTION_KEY is the wrong length", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64"); // 16 bytes, not 32
    expect(() => encrypt("secret")).toThrow(/must decode to exactly 32 bytes/);
  });

  it("throws on a malformed payload instead of returning a partial result", () => {
    expect(() => decrypt("not-a-valid-payload")).toThrow(/Malformed encrypted payload/);
  });
});
