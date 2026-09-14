import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getInteractiveBrokersActivityCooldownMs, getInteractiveBrokersStaleLockMs } from "./interactive-brokers-sync-config";

const original = { ...process.env };

function resetEnv() {
  for (const key of ["IBKR_SYNC_STALE_LOCK_MINUTES", "IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES"]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

beforeEach(() => {
  delete process.env.IBKR_SYNC_STALE_LOCK_MINUTES;
  delete process.env.IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES;
});

afterEach(resetEnv);

describe("getInteractiveBrokersStaleLockMs", () => {
  it("defaults to 10 minutes", () => {
    expect(getInteractiveBrokersStaleLockMs()).toBe(10 * 60_000);
  });

  it("respects a valid override", () => {
    process.env.IBKR_SYNC_STALE_LOCK_MINUTES = "5";
    expect(getInteractiveBrokersStaleLockMs()).toBe(5 * 60_000);
  });
});

describe("getInteractiveBrokersActivityCooldownMs", () => {
  it("defaults to IBKR's own documented 15-minute /pa/transactions rate limit", () => {
    expect(getInteractiveBrokersActivityCooldownMs()).toBe(15 * 60_000);
  });

  it("SECURITY: never allows configuring the cooldown BELOW IBKR's documented limit, even if an operator tries", () => {
    process.env.IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES = "1";
    expect(getInteractiveBrokersActivityCooldownMs()).toBe(15 * 60_000);

    process.env.IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES = "0";
    expect(getInteractiveBrokersActivityCooldownMs()).toBe(15 * 60_000);

    process.env.IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES = "-5";
    expect(getInteractiveBrokersActivityCooldownMs()).toBe(15 * 60_000);
  });

  it("allows configuring the cooldown ABOVE the documented limit for extra safety margin", () => {
    process.env.IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES = "30";
    expect(getInteractiveBrokersActivityCooldownMs()).toBe(30 * 60_000);
  });

  it("ignores a non-numeric override and falls back to the default", () => {
    process.env.IBKR_ACTIVITY_SYNC_COOLDOWN_MINUTES = "not-a-number";
    expect(getInteractiveBrokersActivityCooldownMs()).toBe(15 * 60_000);
  });
});
