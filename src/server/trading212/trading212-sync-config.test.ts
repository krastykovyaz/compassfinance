import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getTrading212SyncIntervalMs,
  getTrading212StaleLockMs,
  getTrading212MaxConcurrentSyncs,
  getTrading212CronSecret,
  isTrading212AutoSyncEnabled,
} from "./trading212-sync-config";

// NODE_ENV is typed read-only by @types/node (assigning it directly is a
// compile error) — vi.stubEnv/vi.unstubAllEnvs handles that one; every
// other var here is a plain, writable process.env key restored manually.
const ENV_KEYS = [
  "TRADING212_SYNC_INTERVAL_MINUTES",
  "TRADING212_SYNC_STALE_LOCK_MINUTES",
  "TRADING212_SYNC_MAX_CONCURRENCY",
  "TRADING212_SYNC_CRON_SECRET",
  "TRADING212_AUTO_SYNC_ENABLED",
];
const original: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) original[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  vi.unstubAllEnvs();
});

describe("getTrading212SyncIntervalMs", () => {
  it("defaults to 15 minutes", () => {
    delete process.env.TRADING212_SYNC_INTERVAL_MINUTES;
    expect(getTrading212SyncIntervalMs()).toBe(15 * 60_000);
  });

  it("honors a configured interval", () => {
    process.env.TRADING212_SYNC_INTERVAL_MINUTES = "5";
    expect(getTrading212SyncIntervalMs()).toBe(5 * 60_000);
  });

  it("falls back to the default for an invalid value rather than NaN/zero", () => {
    process.env.TRADING212_SYNC_INTERVAL_MINUTES = "not-a-number";
    expect(getTrading212SyncIntervalMs()).toBe(15 * 60_000);
    process.env.TRADING212_SYNC_INTERVAL_MINUTES = "-5";
    expect(getTrading212SyncIntervalMs()).toBe(15 * 60_000);
  });
});

describe("getTrading212StaleLockMs", () => {
  it("defaults to 10 minutes", () => {
    delete process.env.TRADING212_SYNC_STALE_LOCK_MINUTES;
    expect(getTrading212StaleLockMs()).toBe(10 * 60_000);
  });
});

describe("getTrading212MaxConcurrentSyncs", () => {
  it("defaults to 3", () => {
    delete process.env.TRADING212_SYNC_MAX_CONCURRENCY;
    expect(getTrading212MaxConcurrentSyncs()).toBe(3);
  });

  it("honors a configured value", () => {
    process.env.TRADING212_SYNC_MAX_CONCURRENCY = "10";
    expect(getTrading212MaxConcurrentSyncs()).toBe(10);
  });
});

describe("getTrading212CronSecret", () => {
  it("returns null when unconfigured — the route fails closed", () => {
    delete process.env.TRADING212_SYNC_CRON_SECRET;
    expect(getTrading212CronSecret()).toBeNull();
  });

  it("returns the configured secret", () => {
    process.env.TRADING212_SYNC_CRON_SECRET = "real-secret-value";
    expect(getTrading212CronSecret()).toBe("real-secret-value");
  });
});

describe("isTrading212AutoSyncEnabled", () => {
  it("defaults to enabled in production", () => {
    delete process.env.TRADING212_AUTO_SYNC_ENABLED;
    vi.stubEnv("NODE_ENV", "production");
    expect(isTrading212AutoSyncEnabled()).toBe(true);
  });

  it("defaults to disabled outside production (dev/test)", () => {
    delete process.env.TRADING212_AUTO_SYNC_ENABLED;
    vi.stubEnv("NODE_ENV", "test");
    expect(isTrading212AutoSyncEnabled()).toBe(false);
  });

  it("an explicit true overrides a non-production NODE_ENV", () => {
    process.env.TRADING212_AUTO_SYNC_ENABLED = "true";
    vi.stubEnv("NODE_ENV", "test");
    expect(isTrading212AutoSyncEnabled()).toBe(true);
  });

  it("an explicit false overrides production (the ops kill-switch)", () => {
    process.env.TRADING212_AUTO_SYNC_ENABLED = "false";
    vi.stubEnv("NODE_ENV", "production");
    expect(isTrading212AutoSyncEnabled()).toBe(false);
  });
});
