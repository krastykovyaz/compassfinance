import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isHyperliquidEnabled, getHyperliquidBaseUrl, getHyperliquidTimeoutMs } from "./config";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.HYPERLIQUID_ENABLED;
  delete process.env.HYPERLIQUID_API_BASE_URL;
  delete process.env.HYPERLIQUID_TIMEOUT_MS;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isHyperliquidEnabled", () => {
  it("is false when unset", () => {
    expect(isHyperliquidEnabled()).toBe(false);
  });

  it("is true only for the exact string \"true\"", () => {
    process.env.HYPERLIQUID_ENABLED = "true";
    expect(isHyperliquidEnabled()).toBe(true);
  });

  it("is false for any other value, including truthy-looking ones", () => {
    for (const v of ["TRUE", "1", "yes", "false", ""]) {
      process.env.HYPERLIQUID_ENABLED = v;
      expect(isHyperliquidEnabled()).toBe(false);
    }
  });
});

describe("getHyperliquidBaseUrl", () => {
  it("defaults to the real public Hyperliquid Info endpoint", () => {
    expect(getHyperliquidBaseUrl()).toBe("https://api.hyperliquid.xyz/info");
  });

  it("uses an override when set", () => {
    process.env.HYPERLIQUID_API_BASE_URL = "https://example.test/info";
    expect(getHyperliquidBaseUrl()).toBe("https://example.test/info");
  });
});

describe("getHyperliquidTimeoutMs", () => {
  it("defaults to 10000ms", () => {
    expect(getHyperliquidTimeoutMs()).toBe(10_000);
  });

  it("uses a valid positive override", () => {
    process.env.HYPERLIQUID_TIMEOUT_MS = "5000";
    expect(getHyperliquidTimeoutMs()).toBe(5000);
  });

  it("falls back to the default for an invalid override", () => {
    for (const v of ["not-a-number", "-5", "0"]) {
      process.env.HYPERLIQUID_TIMEOUT_MS = v;
      expect(getHyperliquidTimeoutMs()).toBe(10_000);
    }
  });
});
