import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Server-only AES-256-GCM encryption for credentials at rest (Trading 212
// API key/secret today; any future brokerage integration's credentials
// reuse this same utility rather than each rolling its own). GCM is an
// authenticated mode — decrypt() fails loudly if the ciphertext was
// tampered with or the wrong key is used, rather than silently returning
// garbage.
//
// Never imports into any client component (the "server-only" import
// above throws at build time if that ever happens) — this file's whole
// reason to exist is that a credential's plaintext form must never leave
// the server process at all, encrypted or not.

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // recommended GCM nonce size

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set — required to encrypt/decrypt stored credentials. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}) — generate one with: openssl rand -base64 32`
    );
  }
  return key;
}

/** Encrypts `plaintext` into a single self-contained string: base64(iv),
 * base64(authTag), and base64(ciphertext) joined with ".". A fresh random
 * IV is generated per call — the same plaintext encrypted twice never
 * produces the same ciphertext, so this is safe to call repeatedly for
 * the same credential (e.g. re-encrypting on rotation). */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

/** Reverses encrypt(). Throws (never returns a partial/garbage string) if
 * the payload is malformed, the auth tag doesn't verify (tampered
 * ciphertext or wrong key), or CREDENTIALS_ENCRYPTION_KEY doesn't match
 * whatever key encrypted this value. */
export function decrypt(payload: string): string {
  const key = getKey();
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted payload — expected iv.authTag.ciphertext");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
