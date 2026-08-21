import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMeta = vi.fn();
vi.mock("./client", () => ({
  fetchMeta: (...args: unknown[]) => fetchMeta(...args),
}));

import { clearMarketCache } from "@/server/market/cache";
import { getHyperliquidUniverse, isKnownHyperliquidCoin } from "./markets";

beforeEach(() => {
  vi.clearAllMocks();
  clearMarketCache();
});

const RAW_META = {
  universe: [
    { name: "BTC", szDecimals: 5, maxLeverage: 50 },
    { name: "ETH", szDecimals: 4, maxLeverage: 50 },
  ],
};

describe("getHyperliquidUniverse", () => {
  it("returns the normalized universe with a stable index matching Hyperliquid's own ordering", async () => {
    fetchMeta.mockResolvedValue({ ok: true, data: RAW_META });

    const result = await getHyperliquidUniverse();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.universe).toEqual([
        { coin: "BTC", index: 0, szDecimals: 5, maxLeverage: 50 },
        { coin: "ETH", index: 1, szDecimals: 4, maxLeverage: 50 },
      ]);
    }
  });

  it("returns unavailable (not an empty/fake universe) when Hyperliquid can't answer", async () => {
    fetchMeta.mockResolvedValue({ ok: false, reason: "network_error", message: "Network error reaching Hyperliquid" });

    const result = await getHyperliquidUniverse();

    expect(result.status).toBe("unavailable");
  });

  it("caches within the TTL — a second call doesn't refetch", async () => {
    fetchMeta.mockResolvedValue({ ok: true, data: RAW_META });

    await getHyperliquidUniverse();
    await getHyperliquidUniverse();

    expect(fetchMeta).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure — the next call retries", async () => {
    fetchMeta.mockResolvedValueOnce({ ok: false, reason: "network_error", message: "down" });
    fetchMeta.mockResolvedValueOnce({ ok: true, data: RAW_META });

    const first = await getHyperliquidUniverse();
    const second = await getHyperliquidUniverse();

    expect(first.status).toBe("unavailable");
    expect(second.status).toBe("ok");
    expect(fetchMeta).toHaveBeenCalledTimes(2);
  });
});

describe("isKnownHyperliquidCoin", () => {
  it("is true for a coin in the universe", async () => {
    fetchMeta.mockResolvedValue({ ok: true, data: RAW_META });
    expect(await isKnownHyperliquidCoin("BTC")).toBe(true);
  });

  it("is false for an unknown coin", async () => {
    fetchMeta.mockResolvedValue({ ok: true, data: RAW_META });
    expect(await isKnownHyperliquidCoin("DOGE")).toBe(false);
  });

  it("is false (never throws) when the universe itself is unavailable", async () => {
    fetchMeta.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });
    expect(await isKnownHyperliquidCoin("BTC")).toBe(false);
  });
});
