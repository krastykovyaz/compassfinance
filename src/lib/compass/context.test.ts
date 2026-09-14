import { describe, expect, it } from "vitest";
import { parseCompassContext, encodeContextKey, decodeContext } from "./context";

describe("parseCompassContext", () => {
  it("accepts every valid context shape", () => {
    expect(parseCompassContext({ type: "HOME" })).toEqual({ type: "HOME" });
    expect(parseCompassContext({ type: "PROFILE" })).toEqual({ type: "PROFILE" });
    expect(parseCompassContext({ type: "TRADING212_CONNECTION" })).toEqual({ type: "TRADING212_CONNECTION" });
    expect(parseCompassContext({ type: "IBKR_CONNECTION" })).toEqual({ type: "IBKR_CONNECTION" });
    expect(parseCompassContext({ type: "HYPERLIQUID_CONNECTION" })).toEqual({ type: "HYPERLIQUID_CONNECTION" });
    expect(parseCompassContext({ type: "PORTFOLIO", source: "IBKR" })).toEqual({ type: "PORTFOLIO", source: "IBKR" });
    expect(parseCompassContext({ type: "NEWS", articleId: "abc-123" })).toEqual({ type: "NEWS", articleId: "abc-123" });
    expect(parseCompassContext({ type: "NEWS" })).toEqual({ type: "NEWS" }); // browsing the feed, no article selected yet
    expect(parseCompassContext({ type: "ASSET", assetId: "nvda" })).toEqual({ type: "ASSET", assetId: "nvda" });
    expect(parseCompassContext({ type: "LEARNING", assetId: "nvda", lessonId: "lesson-1" })).toEqual({
      type: "LEARNING",
      assetId: "nvda",
      lessonId: "lesson-1",
    });
    expect(parseCompassContext({ type: "LEARNING", assetId: "nvda" })).toEqual({
      type: "LEARNING",
      assetId: "nvda",
      lessonId: null,
    });
  });

  it("accepts every documented PORTFOLIO source", () => {
    for (const source of ["ALL", "PAPER", "TRADING212", "IBKR", "HYPERLIQUID"]) {
      expect(parseCompassContext({ type: "PORTFOLIO", source })).toEqual({ type: "PORTFOLIO", source });
    }
  });

  it("rejects malformed or unrecognized input rather than guessing a fallback", () => {
    expect(parseCompassContext(null)).toBeNull();
    expect(parseCompassContext(undefined)).toBeNull();
    expect(parseCompassContext("HOME")).toBeNull();
    expect(parseCompassContext({})).toBeNull();
    expect(parseCompassContext({ type: "NOT_A_REAL_TYPE" })).toBeNull();
    expect(parseCompassContext({ type: "PORTFOLIO", source: "REVOLUT" })).toBeNull();
    expect(parseCompassContext({ type: "PORTFOLIO" })).toBeNull();
    expect(parseCompassContext({ type: "NEWS", articleId: "" })).toBeNull();
    expect(parseCompassContext({ type: "NEWS", articleId: 12345 })).toBeNull();
    expect(parseCompassContext({ type: "ASSET", assetId: "a".repeat(101) })).toBeNull();
  });

  it("SECURITY: never trusts an arbitrary extra field (e.g. a smuggled userId) — only recognizes the documented shape", () => {
    const result = parseCompassContext({ type: "ASSET", assetId: "nvda", userId: "attacker-supplied" });
    expect(result).toEqual({ type: "ASSET", assetId: "nvda" });
    expect(result).not.toHaveProperty("userId");
  });
});

describe("encodeContextKey", () => {
  it("encodes each context type into its stored key", () => {
    expect(encodeContextKey({ type: "HOME" })).toBeNull();
    expect(encodeContextKey({ type: "PROFILE" })).toBeNull();
    expect(encodeContextKey({ type: "PORTFOLIO", source: "IBKR" })).toBe("IBKR");
    expect(encodeContextKey({ type: "NEWS", articleId: "abc-123" })).toBe("abc-123");
    expect(encodeContextKey({ type: "NEWS" })).toBeNull();
    expect(encodeContextKey({ type: "ASSET", assetId: "nvda" })).toBe("nvda");
    expect(encodeContextKey({ type: "LEARNING", assetId: "nvda", lessonId: "lesson-1" })).toBe("nvda:lesson-1");
    expect(encodeContextKey({ type: "LEARNING", assetId: "nvda", lessonId: null })).toBe("nvda");
  });
});

describe("decodeContext", () => {
  it("round-trips NEWS with an articleId", () => {
    expect(decodeContext("NEWS", "abc-123")).toEqual({ type: "NEWS", articleId: "abc-123" });
  });

  it("round-trips NEWS without an articleId (browsing the feed) — a null key is NEWS-general, not an invalid row", () => {
    expect(decodeContext("NEWS", null)).toEqual({ type: "NEWS", articleId: undefined });
  });
});
