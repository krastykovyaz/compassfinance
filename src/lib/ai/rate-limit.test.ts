import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, getClientKey, RATE_LIMIT_MAX_BUCKETS } from "./rate-limit";

type RateLimitGlobals = { __compassAIRateLimit?: Map<string, unknown>; __compassAIRateLimitLastSweep?: number };
const state = globalThis as unknown as RateLimitGlobals;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
  state.__compassAIRateLimit?.clear();
  state.__compassAIRateLimitLastSweep = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows 12 requests per minute by default, then refuses", () => {
    for (let i = 0; i < 12; i++) expect(checkRateLimit("k")).toBe(true);
    expect(checkRateLimit("k")).toBe(false);
  });

  it("honours a per-call max for endpoints that are legitimately polled", () => {
    for (let i = 0; i < 120; i++) expect(checkRateLimit("polled", { max: 120 })).toBe(true);
    expect(checkRateLimit("polled", { max: 120 })).toBe(false);
  });

  it("starts a fresh window once the minute has passed", () => {
    for (let i = 0; i < 12; i++) checkRateLimit("k");
    expect(checkRateLimit("k")).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("k")).toBe(true);
  });

  it("keeps separate keys independent", () => {
    for (let i = 0; i < 12; i++) checkRateLimit("a");
    expect(checkRateLimit("a")).toBe(false);
    expect(checkRateLimit("b")).toBe(true);
  });

  it("forgets expired buckets instead of keeping one entry per key forever", () => {
    for (let i = 0; i < 500; i++) checkRateLimit(`ip-${i}`);
    expect(state.__compassAIRateLimit?.size).toBe(500);

    vi.advanceTimersByTime(60_001);
    checkRateLimit("someone-new");

    expect(state.__compassAIRateLimit?.size).toBe(1);
  });

  it("never tracks more than the ceiling, even when every request uses a new key inside one window", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_BUCKETS + 250; i++) checkRateLimit(`flood-${i}`);
    expect(state.__compassAIRateLimit?.size).toBe(RATE_LIMIT_MAX_BUCKETS);
  });
});

describe("getClientKey", () => {
  it("prefers X-Real-IP, which the proxy sets from the real connection", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7" });
    expect(getClientKey(headers)).toBe("203.0.113.7");
  });

  it("uses the LAST X-Forwarded-For hop (appended by the proxy), never the first (chosen by the client)", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 203.0.113.7" });
    expect(getClientKey(headers)).toBe("203.0.113.7");
  });

  it("gives the same key no matter what the client puts in front of the proxy's own hop", () => {
    const a = getClientKey(new Headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.7" }));
    const b = getClientKey(new Headers({ "x-forwarded-for": "10.0.0.2, 203.0.113.7" }));
    expect(a).toBe(b);
  });

  it("falls back to a shared constant when no proxy header is present", () => {
    expect(getClientKey(new Headers())).toBe("local");
  });
});
