import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMeta = vi.fn();
const fetchPerpDexs = vi.fn();
const fetchSpotMeta = vi.fn();
vi.mock("./client", () => ({
  fetchMeta: (...args: unknown[]) => fetchMeta(...args),
  fetchPerpDexs: (...args: unknown[]) => fetchPerpDexs(...args),
  fetchSpotMeta: (...args: unknown[]) => fetchSpotMeta(...args),
}));

import { clearMarketCache } from "@/server/market/cache";
import { getHyperliquidUniverse, getHyperliquidPerpDexIndex, getUsdcTokenId, isKnownHyperliquidCoin } from "./markets";

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
        { coin: "BTC", index: 0, szDecimals: 5, maxLeverage: 50, venue: "native", dex: null },
        { coin: "ETH", index: 1, szDecimals: 4, maxLeverage: 50, venue: "native", dex: null },
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

const RAW_PERP_DEXS = [
  null,
  { name: "xyz", fullName: "XYZ", deployer: "0x8880806a71d74ad0a510b350545c9ae490912f0888", oracleUpdater: null },
];

const RAW_XYZ_META = {
  universe: [
    { name: "xyz:TSLA", szDecimals: 3, maxLeverage: 20 },
    { name: "xyz:AAPL", szDecimals: 3, maxLeverage: 20 },
  ],
};

describe("getHyperliquidUniverse — HIP-3 merge (Phase 8)", () => {
  it("merges the native dex with a configured HIP-3 dex, computing each HIP-3 entry's asset id via the documented formula", async () => {
    fetchPerpDexs.mockResolvedValue({ ok: true, data: RAW_PERP_DEXS });
    fetchMeta.mockImplementation(async (dex?: string) =>
      dex === "xyz" ? { ok: true, data: RAW_XYZ_META } : { ok: true, data: RAW_META }
    );

    const result = await getHyperliquidUniverse();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const byCoin = Object.fromEntries(result.universe.map((u) => [u.coin, u]));
    expect(byCoin.BTC).toEqual({ coin: "BTC", index: 0, szDecimals: 5, maxLeverage: 50, venue: "native", dex: null });
    // xyz is at position 1 in RAW_PERP_DEXS (including the leading null
    // main-dex slot) => 100000 + 1*10000 + index_in_meta.
    expect(byCoin["xyz:TSLA"]).toEqual({
      coin: "xyz:TSLA",
      index: 110000,
      szDecimals: 3,
      maxLeverage: 20,
      venue: "hip3",
      dex: "xyz",
    });
    expect(byCoin["xyz:AAPL"]).toEqual({
      coin: "xyz:AAPL",
      index: 110001,
      szDecimals: 3,
      maxLeverage: 20,
      venue: "hip3",
      dex: "xyz",
    });
  });

  it("a HIP-3 dex the live perpDexs list doesn't (yet) contain degrades to just skipping it — native BTC/ETH stay intact", async () => {
    fetchPerpDexs.mockResolvedValue({ ok: true, data: [null] }); // "xyz" not present
    fetchMeta.mockResolvedValue({ ok: true, data: RAW_META });

    const result = await getHyperliquidUniverse();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.universe.map((u) => u.coin)).toEqual(["BTC", "ETH"]);
    }
  });

  it("a HIP-3 dex's meta fetch failing degrades to skipping it — native BTC/ETH stay intact, nothing throws", async () => {
    fetchPerpDexs.mockResolvedValue({ ok: true, data: RAW_PERP_DEXS });
    fetchMeta.mockImplementation(async (dex?: string) =>
      dex === "xyz" ? { ok: false, reason: "network_error", message: "down" } : { ok: true, data: RAW_META }
    );

    const result = await getHyperliquidUniverse();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.universe.map((u) => u.coin)).toEqual(["BTC", "ETH"]);
    }
  });
});

describe("getHyperliquidPerpDexIndex", () => {
  it("returns the dex's real position in the live perpDexs list, including the leading main-dex null slot", async () => {
    fetchPerpDexs.mockResolvedValue({ ok: true, data: RAW_PERP_DEXS });
    expect(await getHyperliquidPerpDexIndex("xyz")).toBe(1);
  });

  it("returns null (never throws) for a dex Hyperliquid doesn't currently know about", async () => {
    fetchPerpDexs.mockResolvedValue({ ok: true, data: [null] });
    expect(await getHyperliquidPerpDexIndex("xyz")).toBeNull();
  });

  it("returns null (never throws) when the perpDexs fetch itself fails", async () => {
    fetchPerpDexs.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });
    expect(await getHyperliquidPerpDexIndex("xyz")).toBeNull();
  });
});

describe("getUsdcTokenId", () => {
  it("resolves USDC's real tokenId in the NAME:tokenId format sendAsset requires", async () => {
    fetchSpotMeta.mockResolvedValue({
      ok: true,
      data: { tokens: [{ name: "USDC", index: 0, tokenId: "0xabc123" }, { name: "PURR", index: 1, tokenId: "0xdef456" }] },
    });
    expect(await getUsdcTokenId()).toBe("USDC:0xabc123");
  });

  it("returns null (never throws) when USDC isn't found or the fetch fails", async () => {
    fetchSpotMeta.mockResolvedValue({ ok: true, data: { tokens: [{ name: "PURR", index: 1, tokenId: "0xdef456" }] } });
    expect(await getUsdcTokenId()).toBeNull();

    fetchSpotMeta.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });
    expect(await getUsdcTokenId()).toBeNull();
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
