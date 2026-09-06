import { describe, expect, it, vi } from "vitest";
import { waitForDexBalanceChange } from "./hyperliquid-transfer-confirmation";

function immediateSleep(calls: number[]) {
  return async (ms: number) => {
    calls.push(ms);
  };
}

describe("waitForDexBalanceChange", () => {
  it("returns true immediately when the first reading already differs from the baseline", async () => {
    const fetchBalance = vi.fn().mockResolvedValue(692.5);
    const sleepCalls: number[] = [];

    const result = await waitForDexBalanceChange({
      fetchBalance,
      baseline: 792.5,
      sleep: immediateSleep(sleepCalls),
    });

    expect(result).toBe(true);
    expect(fetchBalance).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toEqual([]); // no sleep before the very first attempt
  });

  it("keeps polling (sleeping between attempts) until a real change appears", async () => {
    const fetchBalance = vi.fn().mockResolvedValueOnce(792.5).mockResolvedValueOnce(792.5).mockResolvedValueOnce(892.5);
    const sleepCalls: number[] = [];

    const result = await waitForDexBalanceChange({
      fetchBalance,
      baseline: 792.5,
      intervalMs: 2000,
      sleep: immediateSleep(sleepCalls),
    });

    expect(result).toBe(true);
    expect(fetchBalance).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([2000, 2000]); // one sleep between each pair of attempts
  });

  it("returns false once attempts are exhausted with no real change — the exact reproduced bug: Hyperliquid reports success but the balance never moves", async () => {
    const fetchBalance = vi.fn().mockResolvedValue(792.5); // never changes, like the real reproduction
    const sleepCalls: number[] = [];

    const result = await waitForDexBalanceChange({
      fetchBalance,
      baseline: 792.5,
      attempts: 3,
      sleep: immediateSleep(sleepCalls),
    });

    expect(result).toBe(false);
    expect(fetchBalance).toHaveBeenCalledTimes(3);
  });

  it("treats a null reading (a transient fetch failure mid-poll) as no-change-yet, not a hard failure — keeps retrying", async () => {
    const fetchBalance = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(692.5);
    const sleepCalls: number[] = [];

    const result = await waitForDexBalanceChange({
      fetchBalance,
      baseline: 792.5,
      sleep: immediateSleep(sleepCalls),
    });

    expect(result).toBe(true);
    expect(fetchBalance).toHaveBeenCalledTimes(2);
  });

  it("a tiny floating-point difference below the epsilon does not count as a real change", async () => {
    const fetchBalance = vi.fn().mockResolvedValue(792.5000001);
    const sleepCalls: number[] = [];

    const result = await waitForDexBalanceChange({
      fetchBalance,
      baseline: 792.5,
      attempts: 1,
      sleep: immediateSleep(sleepCalls),
    });

    expect(result).toBe(false);
  });

  it("uses the default attempts/intervalMs when not specified", async () => {
    const fetchBalance = vi.fn().mockResolvedValue(792.5); // never changes
    const sleepCalls: number[] = [];

    await waitForDexBalanceChange({ fetchBalance, baseline: 792.5, sleep: immediateSleep(sleepCalls) });

    expect(fetchBalance).toHaveBeenCalledTimes(5); // default attempts
    expect(sleepCalls).toEqual([2000, 2000, 2000, 2000]); // default intervalMs, one fewer sleep than attempts
  });
});
