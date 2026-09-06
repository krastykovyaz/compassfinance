import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMetaAndAssetCtxs = vi.fn();
const fetchCandleSnapshot = vi.fn();
const fetchL2Book = vi.fn();
const fetchClearinghouseState = vi.fn();
const fetchOpenOrders = vi.fn();
const fetchUserFills = vi.fn();
const fetchMeta = vi.fn();
const postExchange = vi.fn();
const fetchUserAbstraction = vi.fn();
const fetchSpotClearinghouseState = vi.fn();
const fetchPerpDexs = vi.fn();
const fetchSpotMeta = vi.fn();
const getServerLearningProgress = vi.fn();

vi.mock("@/server/repositories/learning-repository", () => ({
  getServerLearningProgress: (...args: unknown[]) => getServerLearningProgress(...args),
}));

vi.mock("./client", () => ({
  fetchMetaAndAssetCtxs: (...args: unknown[]) => fetchMetaAndAssetCtxs(...args),
  fetchCandleSnapshot: (...args: unknown[]) => fetchCandleSnapshot(...args),
  fetchL2Book: (...args: unknown[]) => fetchL2Book(...args),
  fetchClearinghouseState: (...args: unknown[]) => fetchClearinghouseState(...args),
  fetchOpenOrders: (...args: unknown[]) => fetchOpenOrders(...args),
  fetchUserFills: (...args: unknown[]) => fetchUserFills(...args),
  fetchMeta: (...args: unknown[]) => fetchMeta(...args),
  postExchange: (...args: unknown[]) => postExchange(...args),
  fetchUserAbstraction: (...args: unknown[]) => fetchUserAbstraction(...args),
  fetchSpotClearinghouseState: (...args: unknown[]) => fetchSpotClearinghouseState(...args),
  fetchPerpDexs: (...args: unknown[]) => fetchPerpDexs(...args),
  fetchSpotMeta: (...args: unknown[]) => fetchSpotMeta(...args),
}));

import { clearMarketCache } from "@/server/market/cache";
import {
  getHyperliquidMarkets,
  getHyperliquidCandles,
  getHyperliquidOrderBook,
  getHyperliquidAccount,
  getHyperliquidOpenOrders,
  getHyperliquidUserFills,
  submitHyperliquidExchangeAction,
} from "./service";

const RAW_META = {
  universe: [
    { name: "BTC", szDecimals: 5, maxLeverage: 50 },
    { name: "ETH", szDecimals: 4, maxLeverage: 50 },
  ],
};

const RAW_ASSET_CTXS = [
  { dayNtlVlm: "1000000", funding: "0.0001", markPx: "60000", midPx: "60001", openInterest: "500", oraclePx: "60000.5", prevDayPx: "59000" },
  { dayNtlVlm: "500000", funding: "0.0002", markPx: "3000", midPx: "3000.5", openInterest: "200", oraclePx: "3000.2", prevDayPx: "2950" },
];

// Phase 8 — the "xyz" HIP-3 dex, at position 1 in the live perpDexs list
// (including the leading null main-dex slot), matching the real,
// verified mainnet/testnet layout.
const RAW_PERP_DEXS = [
  null,
  { name: "xyz", fullName: "XYZ", deployer: "0x88806a71d74ad0a510b350545c9ae490912f0888", oracleUpdater: null },
];

const RAW_XYZ_META = {
  universe: [{ name: "xyz:AAPL", szDecimals: 3, maxLeverage: 20 }],
};

const RAW_XYZ_ASSET_CTXS = [
  { dayNtlVlm: "2000000", funding: "0.00005", markPx: "310", midPx: "310.1", openInterest: "1000", oraclePx: "310.05", prevDayPx: "305" },
];

function mockHip3DexResolvable() {
  fetchPerpDexs.mockResolvedValue({ ok: true, data: RAW_PERP_DEXS });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  clearMarketCache();
  process.env.HYPERLIQUID_ENABLED = "true";
  // Default: not a Unified Account — existing clearinghouseState-based
  // account tests keep exercising the classic path unchanged. Tests about
  // the unified override explicitly set these differently.
  fetchUserAbstraction.mockResolvedValue({ ok: true, data: null });
  fetchSpotClearinghouseState.mockResolvedValue({ ok: true, data: { balances: [] } });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getHyperliquidMarkets", () => {
  it("returns unavailable with reason 'disabled' and never calls the client when the flag is off", async () => {
    process.env.HYPERLIQUID_ENABLED = "false";

    const result = await getHyperliquidMarkets();

    expect(result).toEqual({ status: "unavailable", reason: "disabled" });
    expect(fetchMetaAndAssetCtxs).not.toHaveBeenCalled();
  });

  it("normalizes price, 24h change/percent, volume, and funding correctly", async () => {
    fetchMetaAndAssetCtxs.mockResolvedValue({ ok: true, data: [RAW_META, RAW_ASSET_CTXS] });

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markets).toHaveLength(2);
      const btc = result.markets.find((m) => m.assetId === "BTC")!;
      expect(btc.price).toBe(60000);
      expect(btc.change24h).toBe(1000); // 60000 - 59000
      expect(btc.changePercent24h).toBeCloseTo((1000 / 59000) * 100, 5);
      expect(btc.volume24h).toBe(1_000_000);
      expect(btc.fundingRate).toBe(0.0001);
      expect(btc.maxLeverage).toBe(50);
    }
  });

  it("skips a market with a non-numeric field rather than showing a fabricated number", async () => {
    fetchMetaAndAssetCtxs.mockResolvedValue({
      ok: true,
      data: [RAW_META, [{ ...RAW_ASSET_CTXS[0], markPx: "not-a-number" }, RAW_ASSET_CTXS[1]]],
    });

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markets).toHaveLength(1);
      expect(result.markets[0].assetId).toBe("ETH");
    }
  });

  it("returns unavailable (not fake data) when Hyperliquid can't answer", async () => {
    fetchMetaAndAssetCtxs.mockResolvedValue({ ok: false, reason: "network_error", message: "Network error reaching Hyperliquid" });

    const result = await getHyperliquidMarkets();

    expect(result).toEqual({ status: "unavailable", reason: "Network error reaching Hyperliquid" });
  });

  it("returns unavailable when the upstream client throws unexpectedly", async () => {
    fetchMetaAndAssetCtxs.mockRejectedValue(new Error("boom"));

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("unavailable");
  });

  it("Phase 7: filters out coins with no approved CompassFinance mapping — Hyperliquid's raw universe never leaks into Markets", async () => {
    fetchMetaAndAssetCtxs.mockResolvedValue({
      ok: true,
      data: [
        {
          universe: [
            { name: "BTC", szDecimals: 5, maxLeverage: 50 },
            { name: "SOL", szDecimals: 2, maxLeverage: 20 },
            { name: "SPX", szDecimals: 0, maxLeverage: 10 }, // SPX6900 meme coin, not the S&P 500
            { name: "ETH", szDecimals: 4, maxLeverage: 50 },
            { name: "PAXG", szDecimals: 2, maxLeverage: 5 }, // gold-backed token, not gold
          ],
        },
        [
          RAW_ASSET_CTXS[0],
          { ...RAW_ASSET_CTXS[0], markPx: "150" },
          { ...RAW_ASSET_CTXS[0], markPx: "5000" },
          RAW_ASSET_CTXS[1],
          { ...RAW_ASSET_CTXS[0], markPx: "2400" },
        ],
      ],
    });

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markets.map((m) => m.assetId).sort()).toEqual(["BTC", "ETH"]);
    }
  });

  it("Phase 7: displayName is the catalog's human-readable name, and compassAssetId routes back to the catalog id — never the raw Hyperliquid ticker as the primary label", async () => {
    fetchMetaAndAssetCtxs.mockResolvedValue({ ok: true, data: [RAW_META, RAW_ASSET_CTXS] });

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const btc = result.markets.find((m) => m.assetId === "BTC")!;
      const eth = result.markets.find((m) => m.assetId === "ETH")!;
      expect(btc.displayName).toBe("Bitcoin");
      expect(btc.compassAssetId).toBe("btc");
      expect(eth.displayName).toBe("Ethereum");
      expect(eth.compassAssetId).toBe("eth");
    }
  });

  it("caches within the TTL — a second call doesn't refetch", async () => {
    fetchMetaAndAssetCtxs.mockResolvedValue({ ok: true, data: [RAW_META, RAW_ASSET_CTXS] });

    await getHyperliquidMarkets();
    await getHyperliquidMarkets();

    expect(fetchMetaAndAssetCtxs).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure — the very next call retries", async () => {
    fetchMetaAndAssetCtxs.mockResolvedValueOnce({ ok: false, reason: "network_error", message: "down" });
    fetchMetaAndAssetCtxs.mockResolvedValueOnce({ ok: true, data: [RAW_META, RAW_ASSET_CTXS] });

    const first = await getHyperliquidMarkets();
    const second = await getHyperliquidMarkets();

    expect(first.status).toBe("unavailable");
    expect(second.status).toBe("ok");
  });
});

describe("getHyperliquidMarkets — HIP-3 merge (Phase 8)", () => {
  beforeEach(() => {
    mockHip3DexResolvable();
    fetchMetaAndAssetCtxs.mockImplementation(async (dex?: string) =>
      dex === "xyz"
        ? { ok: true, data: [RAW_XYZ_META, RAW_XYZ_ASSET_CTXS] }
        : { ok: true, data: [RAW_META, RAW_ASSET_CTXS] }
    );
  });

  it("includes verified xyz:* markets alongside native BTC/ETH, each correctly tagged venue/dex/dexFullName", async () => {
    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.markets.map((m) => m.assetId).sort()).toEqual(["BTC", "ETH", "xyz:AAPL"]);
    const aapl = result.markets.find((m) => m.assetId === "xyz:AAPL")!;
    expect(aapl.displayName).toBe("Apple Inc.");
    expect(aapl.compassAssetId).toBe("aapl");
    expect(aapl.venue).toBe("hip3");
    expect(aapl.dex).toBe("xyz");
    expect(aapl.dexFullName).toBe("XYZ");
    // xyz at perpDexs position 1, xyz:AAPL at index_in_meta 0.
    expect(aapl.assetIndex).toBe(110000);
    const btc = result.markets.find((m) => m.assetId === "BTC")!;
    expect(btc.venue).toBe("native");
    expect(btc.dex).toBeNull();
    expect(btc.dexFullName).toBeNull();
  });

  it("never leaks an xyz market this app hasn't approved, even though it's a real, liquid market", async () => {
    fetchMetaAndAssetCtxs.mockImplementation(async (dex?: string) =>
      dex === "xyz"
        ? {
            ok: true,
            data: [
              { universe: [{ name: "xyz:AAPL", szDecimals: 3, maxLeverage: 20 }, { name: "xyz:COIN", szDecimals: 3, maxLeverage: 10 }] },
              [RAW_XYZ_ASSET_CTXS[0], { ...RAW_XYZ_ASSET_CTXS[0], markPx: "250" }],
            ],
          }
        : { ok: true, data: [RAW_META, RAW_ASSET_CTXS] }
    );

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markets.map((m) => m.assetId).sort()).toEqual(["BTC", "ETH", "xyz:AAPL"]);
    }
  });

  // Real, reproduced bug (2026-08-23): xyz:SP500 and xyz:BRENTOIL are
  // delisted on Hyperliquid TESTNET specifically (verified live) even
  // though their names still appear in meta and they're fully live on
  // mainnet — the UI showed a stale price with a "no candles available"
  // chart error and let the user proceed toward real trading an asset
  // with zero actual market behind it.
  it("excludes a delisted xyz market even though its name still appears in meta — no stale/fake price shown", async () => {
    fetchMetaAndAssetCtxs.mockImplementation(async (dex?: string) =>
      dex === "xyz"
        ? {
            ok: true,
            data: [
              {
                universe: [
                  { name: "xyz:AAPL", szDecimals: 3, maxLeverage: 20 },
                  { name: "xyz:SP500", szDecimals: 3, maxLeverage: 50, isDelisted: true },
                ],
              },
              [RAW_XYZ_ASSET_CTXS[0], { ...RAW_XYZ_ASSET_CTXS[0], markPx: "7672.8" }],
            ],
          }
        : { ok: true, data: [RAW_META, RAW_ASSET_CTXS] }
    );

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markets.map((m) => m.assetId).sort()).toEqual(["BTC", "ETH", "xyz:AAPL"]);
    }
  });

  it("a native-dex failure still fails the whole call, exactly as before Phase 8", async () => {
    fetchMetaAndAssetCtxs.mockImplementation(async (dex?: string) =>
      dex === "xyz"
        ? { ok: true, data: [RAW_XYZ_META, RAW_XYZ_ASSET_CTXS] }
        : { ok: false, reason: "network_error", message: "native dex down" }
    );

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("unavailable");
  });

  it("an xyz-dex failure degrades to just missing xyz markets — native BTC/ETH still return ok", async () => {
    fetchMetaAndAssetCtxs.mockImplementation(async (dex?: string) =>
      dex === "xyz"
        ? { ok: false, reason: "network_error", message: "xyz down" }
        : { ok: true, data: [RAW_META, RAW_ASSET_CTXS] }
    );

    const result = await getHyperliquidMarkets();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.markets.map((m) => m.assetId).sort()).toEqual(["BTC", "ETH"]);
    }
  });
});

describe("getHyperliquidCandles", () => {
  const RAW_CANDLE = { T: 2000, t: 1000, o: "100", h: "110", l: "95", c: "105", v: "42", s: "BTC", i: "5m" };

  it("returns unavailable with reason 'disabled' and never calls the client when the flag is off", async () => {
    process.env.HYPERLIQUID_ENABLED = "false";

    const result = await getHyperliquidCandles("BTC", "1D");

    expect(result).toEqual({ status: "unavailable", coin: "BTC", range: "1D", reason: "disabled" });
    expect(fetchCandleSnapshot).not.toHaveBeenCalled();
  });

  it("normalizes a candle series into the shared CandlePoint-compatible shape", async () => {
    fetchCandleSnapshot.mockResolvedValue({ ok: true, data: [RAW_CANDLE] });

    const result = await getHyperliquidCandles("BTC", "1D");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.candles).toEqual([{ t: 1000, o: 100, h: 110, l: 95, c: 105, v: 42 }]);
    }
  });

  it("returns unavailable for an unsupported range (5Y) without calling the client", async () => {
    const result = await getHyperliquidCandles("BTC", "5Y");

    expect(result.status).toBe("unavailable");
    expect(fetchCandleSnapshot).not.toHaveBeenCalled();
  });

  it("returns unavailable for an invalid range string without calling the client", async () => {
    const result = await getHyperliquidCandles("BTC", "banana");

    expect(result.status).toBe("unavailable");
    expect(fetchCandleSnapshot).not.toHaveBeenCalled();
  });

  it("returns unavailable (not fake data) on an upstream failure", async () => {
    fetchCandleSnapshot.mockResolvedValue({ ok: false, reason: "not_found", message: "No candles" });

    const result = await getHyperliquidCandles("BTC", "1D");

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toBe("No candles");
  });

  it("caches per coin+range within the TTL", async () => {
    fetchCandleSnapshot.mockResolvedValue({ ok: true, data: [RAW_CANDLE] });

    await getHyperliquidCandles("BTC", "1D");
    await getHyperliquidCandles("BTC", "1D");
    await getHyperliquidCandles("ETH", "1D");

    expect(fetchCandleSnapshot).toHaveBeenCalledTimes(2); // BTC once (cached 2nd time), ETH once
  });
});

describe("getHyperliquidOrderBook", () => {
  const RAW_BOOK = {
    coin: "BTC",
    time: 12345,
    levels: [
      [{ px: "60000", sz: "1.5", n: 3 }],
      [{ px: "60010", sz: "0.5", n: 2 }],
    ],
  };

  it("returns unavailable with reason 'disabled' and never calls the client when the flag is off", async () => {
    process.env.HYPERLIQUID_ENABLED = "false";

    const result = await getHyperliquidOrderBook("BTC");

    expect(result).toEqual({ status: "unavailable", coin: "BTC", reason: "disabled" });
    expect(fetchL2Book).not.toHaveBeenCalled();
  });

  it("normalizes bids (levels[0]) and asks (levels[1]) separately", async () => {
    fetchL2Book.mockResolvedValue({ ok: true, data: RAW_BOOK });

    const result = await getHyperliquidOrderBook("BTC");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.book.bids).toEqual([{ price: 60000, size: 1.5 }]);
      expect(result.book.asks).toEqual([{ price: 60010, size: 0.5 }]);
      expect(result.book.timestamp).toBe(12345);
    }
  });

  it("returns unavailable (not fake data) on an upstream failure", async () => {
    fetchL2Book.mockResolvedValue({ ok: false, reason: "malformed_response", message: "bad book" });

    const result = await getHyperliquidOrderBook("BTC");

    expect(result.status).toBe("unavailable");
  });

  it("rejects an empty coin without calling the client", async () => {
    const result = await getHyperliquidOrderBook("");

    expect(result.status).toBe("unavailable");
    expect(fetchL2Book).not.toHaveBeenCalled();
  });
});

const RAW_POSITION = {
  coin: "BTC",
  szi: "0.5",
  entryPx: "60000",
  leverage: { type: "cross", value: 10 },
  liquidationPx: "54000",
  unrealizedPnl: "500",
  marginUsed: "3000",
  positionValue: "30000",
};

const RAW_CLEARINGHOUSE_STATE = {
  assetPositions: [{ position: RAW_POSITION, type: "oneWay" }],
  marginSummary: { accountValue: "10000", totalMarginUsed: "3000", totalNtlPos: "30000", totalRawUsd: "10000" },
  withdrawable: "7000",
  time: 12345,
};

describe("getHyperliquidAccount", () => {
  it("returns unavailable with reason 'disabled' and never calls the client when the flag is off", async () => {
    process.env.HYPERLIQUID_ENABLED = "false";

    const result = await getHyperliquidAccount("0xabc");

    expect(result).toEqual({ status: "unavailable", reason: "disabled" });
    expect(fetchClearinghouseState).not.toHaveBeenCalled();
  });

  it("rejects an empty address without calling the client", async () => {
    const result = await getHyperliquidAccount("");
    expect(result.status).toBe("unavailable");
    expect(fetchClearinghouseState).not.toHaveBeenCalled();
  });

  it("normalizes balance, account value, margin, and a full position correctly", async () => {
    fetchClearinghouseState.mockResolvedValue({ ok: true, data: RAW_CLEARINGHOUSE_STATE });

    const result = await getHyperliquidAccount("0xabc");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.account.withdrawableBalance).toBe(7000);
      expect(result.account.accountValue).toBe(10000);
      expect(result.account.totalMarginUsed).toBe(3000);
      expect(result.account.positions).toEqual([
        {
          coin: "BTC",
          size: 0.5,
          entryPrice: 60000,
          leverage: 10,
          liquidationPrice: 54000,
          unrealizedPnl: 500,
          marginUsed: 3000,
          positionValue: 30000,
        },
      ]);
    }
  });

  it("passes through a null liquidation price rather than computing one", async () => {
    fetchClearinghouseState.mockResolvedValue({
      ok: true,
      data: {
        ...RAW_CLEARINGHOUSE_STATE,
        assetPositions: [{ position: { ...RAW_POSITION, liquidationPx: null }, type: "oneWay" }],
      },
    });

    const result = await getHyperliquidAccount("0xabc");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.account.positions[0].liquidationPrice).toBeNull();
    }
  });

  it("skips a position with a malformed leverage object rather than crashing the whole account", async () => {
    fetchClearinghouseState.mockResolvedValue({
      ok: true,
      data: {
        ...RAW_CLEARINGHOUSE_STATE,
        assetPositions: [
          { position: { ...RAW_POSITION, leverage: { type: "cross" } }, type: "oneWay" }, // missing value
        ],
      },
    });

    const result = await getHyperliquidAccount("0xabc");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.account.positions).toHaveLength(0);
    }
  });

  it("returns ok with an empty positions array for an address with no Hyperliquid activity — a real empty state, not unavailable", async () => {
    fetchClearinghouseState.mockResolvedValue({
      ok: true,
      data: { ...RAW_CLEARINGHOUSE_STATE, assetPositions: [] },
    });

    const result = await getHyperliquidAccount("0xabc");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.account.positions).toEqual([]);
    }
  });

  it("returns unavailable (not fake data) on an upstream failure", async () => {
    fetchClearinghouseState.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });

    const result = await getHyperliquidAccount("0xabc");

    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable on a rate-limit response", async () => {
    fetchClearinghouseState.mockResolvedValue({ ok: false, reason: "rate_limited", message: "rate limited" });

    const result = await getHyperliquidAccount("0xabc");

    expect(result).toEqual({ status: "unavailable", reason: "rate limited" });
  });

  it("caches per address within the TTL", async () => {
    fetchClearinghouseState.mockResolvedValue({ ok: true, data: RAW_CLEARINGHOUSE_STATE });

    await getHyperliquidAccount("0xabc");
    await getHyperliquidAccount("0xabc");

    expect(fetchClearinghouseState).toHaveBeenCalledTimes(1);
  });

  // Reported bug: a real Hyperliquid testnet wallet with Unified Account
  // Mode enabled (a setting the user turns on in Hyperliquid's own app)
  // showed a real $999 spot balance in Hyperliquid's UI, but CompassFinance
  // kept showing $0.00 available — because classic clearinghouseState's
  // balance/withdrawable figures are documented by Hyperliquid as "not
  // meaningful" once unified. Confirmed against the real Hyperliquid
  // testnet API for that exact wallet before writing this fix.
  describe("Unified Account Mode override — classic clearinghouseState balance is stale once unified", () => {
    it("uses the spot USDC balance instead of clearinghouseState's when userAbstraction reports unifiedAccount", async () => {
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { ...RAW_CLEARINGHOUSE_STATE, assetPositions: [], withdrawable: "0", marginSummary: { ...RAW_CLEARINGHOUSE_STATE.marginSummary, accountValue: "0" } },
      });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "999.0", hold: "0.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "999.0"]],
        },
      });

      const result = await getHyperliquidAccount("0xabc");

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.account.withdrawableBalance).toBe(999);
        expect(result.account.accountValue).toBe(999);
      }
    });

    it("uses tokenToAvailableAfterMaintenance (not raw total) as withdrawable when they differ — e.g. margin held against an open position", async () => {
      fetchClearinghouseState.mockResolvedValue({ ok: true, data: RAW_CLEARINGHOUSE_STATE });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "999.0", hold: "300.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "699.0"]],
        },
      });

      const result = await getHyperliquidAccount("0xabc");

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.account.accountValue).toBe(999);
        expect(result.account.withdrawableBalance).toBe(699);
      }
    });

    it("leaves the classic clearinghouseState values untouched when userAbstraction is null (the common, non-unified case)", async () => {
      fetchClearinghouseState.mockResolvedValue({ ok: true, data: RAW_CLEARINGHOUSE_STATE });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: null });

      const result = await getHyperliquidAccount("0xabc");

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.account.withdrawableBalance).toBe(7000);
        expect(result.account.accountValue).toBe(10000);
      }
      expect(fetchSpotClearinghouseState).not.toHaveBeenCalled();
    });

    it("falls back to the classic clearinghouseState values, without failing the whole request, when userAbstraction itself fails", async () => {
      fetchClearinghouseState.mockResolvedValue({ ok: true, data: RAW_CLEARINGHOUSE_STATE });
      fetchUserAbstraction.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });

      const result = await getHyperliquidAccount("0xabc");

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.account.withdrawableBalance).toBe(7000);
        expect(result.account.accountValue).toBe(10000);
      }
    });

    it("falls back to the classic values when unified but the account has no USDC spot balance entry at all", async () => {
      fetchClearinghouseState.mockResolvedValue({ ok: true, data: RAW_CLEARINGHOUSE_STATE });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({ ok: true, data: { balances: [] } });

      const result = await getHyperliquidAccount("0xabc");

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.account.withdrawableBalance).toBe(7000);
        expect(result.account.accountValue).toBe(10000);
      }
    });
  });

  // Phase 8 — a HIP-3 dex's margin pool is genuinely separate from the
  // main dex's (verified live: the same address holds a different
  // accountValue with dex:"xyz" than without it), so this is a real,
  // independently-fetched account view, not a filtered slice of one
  // shared balance.
  describe("dex-scoped account (Phase 8)", () => {
    it("passes the dex through to fetchClearinghouseState and normalizes that dex's own balance", async () => {
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { ...RAW_CLEARINGHOUSE_STATE, withdrawable: "42", marginSummary: { ...RAW_CLEARINGHOUSE_STATE.marginSummary, accountValue: "42" } },
      });

      const result = await getHyperliquidAccount("0xabc", "xyz");

      expect(fetchClearinghouseState).toHaveBeenCalledWith("0xabc", "xyz");
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.account.withdrawableBalance).toBe(42);
        expect(result.account.accountValue).toBe(42);
      }
    });

    it("never applies the Unified Account Mode spot<->perp override to a HIP-3 dex's balance", async () => {
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { ...RAW_CLEARINGHOUSE_STATE, assetPositions: [], withdrawable: "5", marginSummary: { ...RAW_CLEARINGHOUSE_STATE.marginSummary, accountValue: "5" } },
      });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: { balances: [{ coin: "USDC", token: 0, total: "999", hold: "0", entryNtl: "0" }] },
      });

      const result = await getHyperliquidAccount("0xabc", "xyz");

      expect(fetchUserAbstraction).not.toHaveBeenCalled();
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        // Must stay the xyz dex's own $5, never the main dex's unified $999.
        expect(result.account.withdrawableBalance).toBe(5);
        expect(result.account.accountValue).toBe(5);
      }
    });

    it("caches the native and xyz-dex views separately — one doesn't serve stale data for the other", async () => {
      fetchClearinghouseState.mockImplementation(async (_address: string, dex?: string) => ({
        ok: true,
        data: {
          ...RAW_CLEARINGHOUSE_STATE,
          withdrawable: dex === "xyz" ? "42" : "7000",
          marginSummary: { ...RAW_CLEARINGHOUSE_STATE.marginSummary, accountValue: dex === "xyz" ? "42" : "10000" },
        },
      }));

      const main = await getHyperliquidAccount("0xabc");
      const xyz = await getHyperliquidAccount("0xabc", "xyz");

      expect(fetchClearinghouseState).toHaveBeenCalledTimes(2);
      if (main.status === "ok" && xyz.status === "ok") {
        expect(main.account.withdrawableBalance).toBe(7000);
        expect(xyz.account.withdrawableBalance).toBe(42);
      } else {
        throw new Error("expected both account views to resolve ok");
      }
    });
  });
});

describe("getHyperliquidOpenOrders", () => {
  it("returns unavailable with reason 'disabled' and never calls the client when the flag is off", async () => {
    process.env.HYPERLIQUID_ENABLED = "false";

    const result = await getHyperliquidOpenOrders("0xabc");

    expect(result).toEqual({ status: "unavailable", reason: "disabled" });
    expect(fetchOpenOrders).not.toHaveBeenCalled();
  });

  it("normalizes side, price, and size; maps Hyperliquid's B/A to BUY/SELL", async () => {
    fetchOpenOrders.mockResolvedValue({
      ok: true,
      data: [{ coin: "BTC", limitPx: "60000", oid: 1, side: "B", sz: "0.1", timestamp: 123 }],
    });

    const result = await getHyperliquidOpenOrders("0xabc");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.orders).toEqual([{ coin: "BTC", side: "BUY", price: 60000, size: 0.1, orderId: 1, timestamp: 123 }]);
    }
  });

  it("returns ok with an empty array for an account with no open orders", async () => {
    fetchOpenOrders.mockResolvedValue({ ok: true, data: [] });

    const result = await getHyperliquidOpenOrders("0xabc");

    expect(result).toEqual({ status: "ok", orders: [] });
  });

  it("returns unavailable (not fake data) on an upstream failure", async () => {
    fetchOpenOrders.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });

    const result = await getHyperliquidOpenOrders("0xabc");

    expect(result.status).toBe("unavailable");
  });

  // Phase 8 — per Hyperliquid's own docs, open orders default to the
  // main dex ONLY; a HIP-3 dex's open orders are invisible unless this
  // is passed explicitly (unlike userFills, which already spans every
  // dex by default).
  it("passes the dex through to fetchOpenOrders and caches it separately from the main dex's view", async () => {
    fetchOpenOrders.mockImplementation(async (_address: string, dex?: string) => ({
      ok: true,
      data:
        dex === "xyz"
          ? [{ coin: "xyz:AAPL", limitPx: "300", oid: 2, side: "B", sz: "1", timestamp: 456 }]
          : [{ coin: "BTC", limitPx: "60000", oid: 1, side: "B", sz: "0.1", timestamp: 123 }],
    }));

    const main = await getHyperliquidOpenOrders("0xabc");
    const xyz = await getHyperliquidOpenOrders("0xabc", "xyz");

    expect(fetchOpenOrders).toHaveBeenCalledWith("0xabc", "xyz");
    expect(main.status).toBe("ok");
    expect(xyz.status).toBe("ok");
    if (main.status === "ok" && xyz.status === "ok") {
      expect(main.orders.map((o) => o.coin)).toEqual(["BTC"]);
      expect(xyz.orders.map((o) => o.coin)).toEqual(["xyz:AAPL"]);
    }
  });
});

describe("getHyperliquidUserFills", () => {
  it("returns unavailable with reason 'disabled' and never calls the client when the flag is off", async () => {
    process.env.HYPERLIQUID_ENABLED = "false";

    const result = await getHyperliquidUserFills("0xabc");

    expect(result).toEqual({ status: "unavailable", reason: "disabled" });
    expect(fetchUserFills).not.toHaveBeenCalled();
  });

  it("normalizes fills and sorts newest first", async () => {
    fetchUserFills.mockResolvedValue({
      ok: true,
      data: [
        { coin: "BTC", side: "B", px: "60000", sz: "0.1", closedPnl: "0", fee: "1.2", time: 100, oid: 1 },
        { coin: "BTC", side: "A", px: "61000", sz: "0.1", closedPnl: "10", fee: "1.3", time: 200, oid: 2 },
      ],
    });

    const result = await getHyperliquidUserFills("0xabc");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.fills.map((f) => f.timestamp)).toEqual([200, 100]);
      expect(result.fills[0].side).toBe("SELL");
    }
  });

  it("caps the result at the given limit", async () => {
    fetchUserFills.mockResolvedValue({
      ok: true,
      data: Array.from({ length: 30 }, (_, i) => ({
        coin: "BTC",
        side: "B",
        px: "60000",
        sz: "0.1",
        closedPnl: "0",
        fee: "1",
        time: i,
        oid: i,
      })),
    });

    const result = await getHyperliquidUserFills("0xabc", 20);

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.fills).toHaveLength(20);
  });

  it("returns ok with an empty array for an account with no trade history", async () => {
    fetchUserFills.mockResolvedValue({ ok: true, data: [] });

    const result = await getHyperliquidUserFills("0xabc");

    expect(result).toEqual({ status: "ok", fills: [] });
  });

  it("returns unavailable (not fake data) on an upstream failure", async () => {
    fetchUserFills.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });

    const result = await getHyperliquidUserFills("0xabc");

    expect(result.status).toBe("unavailable");
  });
});

describe("submitHyperliquidExchangeAction — real order execution (Phase 4)", () => {
  const UPDATE_LEVERAGE_ACTION = { type: "updateLeverage", asset: 0, isCross: true, leverage: 5 };
  const ORDER_ACTION = {
    type: "order",
    orders: [{ a: 0, b: true, p: "60000", s: "0.01", r: false, t: { limit: { tif: "FrontendMarket" } } }],
    grouping: "na",
  };
  const SIGNATURE = { r: "0xaaa", s: "0xbbb", v: 27 as const };
  const NONCE = 1_700_000_000_000;
  const USER_ID = "user-1";

  // Fully unlocked for both real-tradeable assets — the default for every
  // existing test in this describe block, so tests about order mechanics
  // (leverage, balance, partial fills, action-type allowlisting...) don't
  // also have to be about the Phase 7 education gate. Tests that ARE
  // about the gate (below) explicitly override this per-case.
  const REAL_TRADING_UNLOCKED_PROGRESS = {
    totalXP: 100000,
    level: 10,
    lessonsCompleted: 13,
    quizzesCompleted: 13,
    correctAnswers: 100,
    currentStreak: 30,
    longestStreak: 30,
    assetsExplored: 13,
    investmentsMade: 10,
    distinctAssetsInvested: 10,
    unlockedAchievements: [],
    completedLessons: ["btc", "eth"],
    completedQuizzes: ["btc", "eth"],
    practiceTradedAssetIds: ["btc", "eth"],
    lastActivityAt: new Date().toISOString(),
  };

  function mockAccountBalance(withdrawable: string) {
    fetchClearinghouseState.mockResolvedValue({
      ok: true,
      data: {
        assetPositions: [],
        marginSummary: { accountValue: withdrawable, totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" },
        withdrawable,
        time: Date.now(),
      },
    });
  }

  beforeEach(() => {
    fetchMeta.mockResolvedValue({ ok: true, data: RAW_META }); // BTC index 0, ETH index 1
    getServerLearningProgress.mockResolvedValue(REAL_TRADING_UNLOCKED_PROGRESS);
  });

  it("returns rejected/disabled and never calls the client when the flag is off", async () => {
    process.env.HYPERLIQUID_ENABLED = "false";

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", UPDATE_LEVERAGE_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "rejected", reason: "disabled", message: expect.any(String) });
    expect(fetchMeta).not.toHaveBeenCalled();
    expect(postExchange).not.toHaveBeenCalled();
  });

  it("rejects an action type outside the exact allowlist, never contacting Hyperliquid", async () => {
    const result = await submitHyperliquidExchangeAction(
      USER_ID, "0xabc",
      { type: "withdraw3", destination: "0xattacker", amount: "1000" },
      NONCE,
      SIGNATURE
    );

    expect(result).toEqual({ status: "rejected", reason: "unknown-action-type", message: expect.any(String) });
    expect(postExchange).not.toHaveBeenCalled();
  });

  it("rejects a coin that isn't in the BTC/ETH allowlist, even if it's a real Hyperliquid market", async () => {
    fetchMeta.mockResolvedValue({
      ok: true,
      data: { universe: [{ name: "SOL", szDecimals: 2, maxLeverage: 20 }] },
    });

    const result = await submitHyperliquidExchangeAction(
      USER_ID, "0xabc",
      { type: "updateLeverage", asset: 0, isCross: true, leverage: 5 },
      NONCE,
      SIGNATURE
    );

    expect(result).toEqual({ status: "rejected", reason: "unknown-coin", message: expect.any(String) });
    expect(postExchange).not.toHaveBeenCalled();
  });

  it("rejects leverage above the coin's real max leverage", async () => {
    const result = await submitHyperliquidExchangeAction(
      USER_ID, "0xabc",
      { type: "updateLeverage", asset: 0, isCross: true, leverage: 999 }, // BTC max is 50 in RAW_META
      NONCE,
      SIGNATURE
    );

    expect(result).toEqual({ status: "rejected", reason: "leverage-exceeds-max", message: expect.any(String) });
    expect(postExchange).not.toHaveBeenCalled();
  });

  it("rejects an order whose notional exceeds what the account's balance could support even at max leverage", async () => {
    mockAccountBalance("1"); // $1 available, max leverage 50x -> max notional $50; order here is 0.01 * 60000 = $600

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
    expect(postExchange).not.toHaveBeenCalled();
  });

  // Close Position feature: a reduce-only order can only shrink an
  // existing position, never add exposure, so it can never legitimately
  // require additional margin. Without this exemption, a user with fully
  // -allocated margin (the common case right before closing a losing
  // position) could get wrongly blocked from closing it at all.
  it("never applies the balance pre-flight check to a reduce-only order, even with $0 available", async () => {
    mockAccountBalance("0");
    postExchange.mockResolvedValue({
      ok: true,
      data: { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } },
    });
    const reduceOnlyAction = {
      ...ORDER_ACTION,
      orders: [{ ...ORDER_ACTION.orders[0], r: true }],
    };

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", reduceOnlyAction, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "resting", orderId: 1 });
    expect(fetchClearinghouseState).not.toHaveBeenCalled();
    expect(postExchange).toHaveBeenCalled();
  });

  it("still applies the balance pre-flight check to a normal (non reduce-only) order — the exemption isn't a blanket bypass", async () => {
    mockAccountBalance("1"); // same underfunded case as the test above, but r:false this time

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
    expect(postExchange).not.toHaveBeenCalled();
  });

  // Phase 7 — real trading requires the same education gate Paper
  // Trading's own BUY enforces, PLUS a completed practice trade of this
  // exact asset. See real-trading-access.ts for the pure gate logic;
  // these tests prove the server actually calls it before ever
  // forwarding a real (non-reduce-only) order to Hyperliquid.
  describe("real-trading education gate (Phase 7)", () => {
    it("rejects a non-reduce-only order when the required course/quiz aren't complete", async () => {
      getServerLearningProgress.mockResolvedValue({
        ...REAL_TRADING_UNLOCKED_PROGRESS,
        completedLessons: [],
        completedQuizzes: [],
      });
      mockAccountBalance("100000");

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "real-trading-locked", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("rejects a non-reduce-only order when education is done but this asset has never been Paper Traded", async () => {
      getServerLearningProgress.mockResolvedValue({
        ...REAL_TRADING_UNLOCKED_PROGRESS,
        practiceTradedAssetIds: ["eth"], // btc's own course/quiz done, but never practice-traded btc
      });
      mockAccountBalance("100000");

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "real-trading-locked", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("never even checks the education gate for a reduce-only order — closing/reducing stays allowed regardless of unlock state", async () => {
      getServerLearningProgress.mockResolvedValue({
        ...REAL_TRADING_UNLOCKED_PROGRESS,
        completedLessons: [],
        completedQuizzes: [],
        practiceTradedAssetIds: [],
      });
      mockAccountBalance("0");
      postExchange.mockResolvedValue({
        ok: true,
        data: { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } },
      });
      const reduceOnlyAction = { ...ORDER_ACTION, orders: [{ ...ORDER_ACTION.orders[0], r: true }] };

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", reduceOnlyAction, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "resting", orderId: 1 });
      expect(getServerLearningProgress).not.toHaveBeenCalled();
    });

    it("allows the order through to the normal balance check once course, quiz, and a practice trade of this asset are all done", async () => {
      getServerLearningProgress.mockResolvedValue(REAL_TRADING_UNLOCKED_PROGRESS);
      mockAccountBalance("1"); // deliberately underfunded — proves the request reached the balance check, not that it succeeded

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
    });

    it("regression: BTC and ETH real order submission both still work exactly as before once education + practice trade are done for each", async () => {
      getServerLearningProgress.mockResolvedValue(REAL_TRADING_UNLOCKED_PROGRESS);
      mockAccountBalance("100000");
      postExchange.mockResolvedValue({
        ok: true,
        data: { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } },
      });

      const btcResult = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);
      expect(btcResult).toEqual({ status: "resting", orderId: 1 });

      const ethOrderAction = {
        ...ORDER_ACTION,
        orders: [{ ...ORDER_ACTION.orders[0], a: 1 }], // ETH is index 1 in RAW_META
      };
      const ethResult = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ethOrderAction, NONCE + 1, SIGNATURE);
      expect(ethResult).toEqual({ status: "resting", orderId: 1 });
    });

    it("an updateLeverage action is never gated by real-trading unlock — only opening a real position is", async () => {
      getServerLearningProgress.mockResolvedValue({
        ...REAL_TRADING_UNLOCKED_PROGRESS,
        completedLessons: [],
        completedQuizzes: [],
        practiceTradedAssetIds: [],
      });
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok" } });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", UPDATE_LEVERAGE_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "pending" });
      expect(postExchange).toHaveBeenCalled();
    });
  });

  it("uses a FRESH balance check on every call, never a cached one — two calls hit fetchClearinghouseState twice", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

    await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);
    await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE + 1, SIGNATURE);

    expect(fetchClearinghouseState).toHaveBeenCalledTimes(2);
  });

  it("forwards the action object byte-identical to postExchange — never reconstructed", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

    await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(postExchange).toHaveBeenCalledWith({ action: ORDER_ACTION, nonce: NONCE, signature: SIGNATURE });
    // Same object reference, not a rebuilt copy.
    expect(postExchange.mock.calls[0][0].action).toBe(ORDER_ACTION);
  });

  it("classifies a plain ok response (updateLeverage) as pending", async () => {
    postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default", data: {} } } });

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", UPDATE_LEVERAGE_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "pending" });
  });

  it("classifies a resting order status", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({
      ok: true,
      data: { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 77738308 } }] } } },
    });

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "resting", orderId: 77738308 });
  });

  it("classifies a filled order status", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({
      ok: true,
      data: {
        status: "ok",
        response: { type: "order", data: { statuses: [{ filled: { totalSz: "0.01", avgPx: "60123.4", oid: 1 } }] } },
      },
    });

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "filled", orderId: 1, totalSize: 0.01, avgPrice: 60123.4 });
  });

  it("classifies a Hyperliquid-side per-order rejection (e.g. minimum order value)", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({
      ok: true,
      data: {
        status: "ok",
        response: { type: "order", data: { statuses: [{ error: "Order must have minimum value of $10." }] } },
      },
    });

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "hyperliquid-rejected", message: "Order must have minimum value of $10." });
  });

  it("classifies a top-level Hyperliquid rejection (e.g. bad signature)", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({ ok: true, data: { status: "err", response: "Invalid signature" } });

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "hyperliquid-rejected", message: "Invalid signature" });
  });

  it("classifies a transport/network failure as network-failure — never a hard 'rejected'", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({ ok: false, reason: "network_error", message: "timed out" });

    const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "network-failure", message: "timed out" });
  });

  describe("approveAgent (Phase 5) — no asset/leverage/balance concept, relays straight through", () => {
    const APPROVE_AGENT_ACTION = {
      type: "approveAgent",
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      agentAddress: "0xagent",
      agentName: "CompassFinance",
      nonce: NONCE,
    };

    it("skips the asset/universe lookup entirely — never calls fetchMeta or fetchClearinghouseState", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default", data: {} } } });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", APPROVE_AGENT_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "pending" });
      expect(fetchMeta).not.toHaveBeenCalled();
      expect(fetchClearinghouseState).not.toHaveBeenCalled();
    });

    it("forwards the action byte-identical to postExchange, same as every other action type", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default", data: {} } } });

      await submitHyperliquidExchangeAction(USER_ID, "0xabc", APPROVE_AGENT_ACTION, NONCE, SIGNATURE);

      expect(postExchange).toHaveBeenCalledWith({ action: APPROVE_AGENT_ACTION, nonce: NONCE, signature: SIGNATURE });
      expect(postExchange.mock.calls[0][0].action).toBe(APPROVE_AGENT_ACTION);
    });

    it("still returns rejected/disabled when the flag is off — the top-level gate applies to every action type", async () => {
      process.env.HYPERLIQUID_ENABLED = "false";

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", APPROVE_AGENT_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "disabled", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("classifies a Hyperliquid-side rejection of the approval the same as any other action", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "err", response: "Invalid signature" } });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", APPROVE_AGENT_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "hyperliquid-rejected", message: "Invalid signature" });
    });
  });

  describe("order pre-flight balance check — Unified Account Mode override (connected bugfix)", () => {
    // Without this, a real Unified Account wallet's classic (stale, always
    // $0 per Hyperliquid's own docs) clearinghouseState balance would
    // wrongly reject a real, adequately-funded order — the agent would
    // sign successfully and then the server would reject it anyway.
    it("uses the real spot balance instead of the stale classic $0 when the account is unified", async () => {
      mockAccountBalance("0"); // classic clearinghouseState: stale $0, as confirmed on the real reported wallet
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "999.0", hold: "0.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "999.0"]],
        },
      });
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

      // 0.01 BTC @ $60000 = $600 notional; BTC max leverage 50x -> needs
      // >= $12 real balance. Classic $0 would reject this; the real $999
      // spot balance should allow it through to postExchange.
      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      expect(result.status).not.toBe("rejected");
      expect(postExchange).toHaveBeenCalled();
    });

    it("still rejects for a genuinely underfunded unified account — the override isn't a bypass", async () => {
      mockAccountBalance("100000"); // classic value would (wrongly) pass — proves the override, not the classic value, decided this
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "1.0", hold: "0.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "1.0"]],
        },
      });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });
  });

  describe("post-trade cache invalidation (Phase 6 audit fix)", () => {
    // Without this, getHyperliquidAccount's 10s getOrFetch cache could
    // serve pre-trade data to the client-side refresh() call that runs
    // immediately after a trade completes — a genuinely successful order
    // could look like it never happened for up to 10s. Verified against
    // the REAL cache module (clearMarketCache() only resets it between
    // tests, not mocked), so this is a real integration check, not just
    // asserting a function was called.
    it("a successful order submission busts the cached account view for that address", async () => {
      mockAccountBalance("100000");
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

      await getHyperliquidAccount("0xabc"); // populate the cache
      expect(fetchClearinghouseState).toHaveBeenCalledTimes(1);

      await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      await getHyperliquidAccount("0xabc"); // must NOT be served stale
      expect(fetchClearinghouseState.mock.calls.length).toBeGreaterThan(1);
    });

    it("does NOT bust the cache for a pre-flight rejection that never reached Hyperliquid", async () => {
      mockAccountBalance("1"); // triggers the insufficient-balance pre-flight rejection

      await getHyperliquidAccount("0xabc"); // populate the cache — 1 call
      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);
      expect(result.status).toBe("rejected");
      expect(postExchange).not.toHaveBeenCalled();
      // The pre-flight balance check itself always makes its own FRESH,
      // uncached fetchClearinghouseState call (by design — see its own
      // comment) — that's call #2, unrelated to the getOrFetch cache this
      // test is actually about. What matters is call #3 below.
      const callsAfterRejection = fetchClearinghouseState.mock.calls.length;

      await getHyperliquidAccount("0xabc"); // should still be served from cache — no 3rd call
      expect(fetchClearinghouseState.mock.calls.length).toBe(callsAfterRejection);
    });

    it("busts the cache even on a network-failure — the outcome is ambiguous, so stale data must never be trusted either", async () => {
      mockAccountBalance("100000");
      postExchange.mockResolvedValue({ ok: false, reason: "network_error", message: "timed out" });

      await getHyperliquidAccount("0xabc");
      expect(fetchClearinghouseState).toHaveBeenCalledTimes(1);

      await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      await getHyperliquidAccount("0xabc");
      expect(fetchClearinghouseState.mock.calls.length).toBeGreaterThan(1);
    });

    it("also busts the cached open-orders and fills views, not just the account view", async () => {
      mockAccountBalance("100000");
      fetchOpenOrders.mockResolvedValue({ ok: true, data: [] });
      fetchUserFills.mockResolvedValue({ ok: true, data: [] });
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

      await getHyperliquidOpenOrders("0xabc");
      await getHyperliquidUserFills("0xabc", 20);
      expect(fetchOpenOrders).toHaveBeenCalledTimes(1);
      expect(fetchUserFills).toHaveBeenCalledTimes(1);

      await submitHyperliquidExchangeAction(USER_ID, "0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      await getHyperliquidOpenOrders("0xabc");
      await getHyperliquidUserFills("0xabc", 20);
      expect(fetchOpenOrders.mock.calls.length).toBeGreaterThan(1);
      expect(fetchUserFills.mock.calls.length).toBeGreaterThan(1);
    });
  });

  // Phase 8 — real orders against a HIP-3 asset (xyz:AAPL here). Same
  // action-submission path as BTC/ETH, but the pre-flight balance check
  // must use that dex's own ISOLATED margin pool, never the main dex's.
  describe("HIP-3 order execution (Phase 8) — dex-scoped balance check", () => {
    const XYZ_ORDER_ACTION = {
      type: "order",
      orders: [{ a: 110000, b: true, p: "310", s: "1", r: false, t: { limit: { tif: "FrontendMarket" } } }],
      grouping: "na",
    };

    beforeEach(() => {
      fetchPerpDexs.mockResolvedValue({
        ok: true,
        data: [null, { name: "xyz", fullName: "XYZ", deployer: "0x888…", oracleUpdater: null }],
      });
      fetchMeta.mockImplementation(async (dex?: string) =>
        dex === "xyz"
          ? { ok: true, data: { universe: [{ name: "xyz:AAPL", szDecimals: 3, maxLeverage: 20 }] } }
          : { ok: true, data: RAW_META }
      );
      // aapl's own investment-unlock stage has a prerequisite chain
      // (sp500 -> nasdaq -> aapl) AND its own requiredAchievementId
      // (STOCK_EXPLORER) — same as the rest of the app's learning
      // progression, unrelated to and untouched by Phase 8's Hyperliquid
      // real-trading mapping. All of it must be done for
      // isInvestmentUnlocked("aapl", ...) to report UNLOCKED.
      getServerLearningProgress.mockResolvedValue({
        ...REAL_TRADING_UNLOCKED_PROGRESS,
        completedLessons: ["sp500", "nasdaq", "aapl"],
        completedQuizzes: ["sp500", "nasdaq", "aapl"],
        unlockedAchievements: ["STOCK_EXPLORER"],
        practiceTradedAssetIds: ["aapl"],
      });
    });

    it("checks the xyz dex's own balance, not the main dex's, for an xyz:AAPL order", async () => {
      fetchClearinghouseState.mockImplementation(async (_address: string, dex?: string) => ({
        ok: true,
        data: {
          assetPositions: [],
          marginSummary: { accountValue: dex === "xyz" ? "10000" : "0", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" },
          withdrawable: dex === "xyz" ? "10000" : "0",
          time: Date.now(),
        },
      }));
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", XYZ_ORDER_ACTION, NONCE, SIGNATURE);

      expect(fetchClearinghouseState).toHaveBeenCalledWith("0xabc", "xyz");
      expect(result.status).not.toBe("rejected");
    });

    it("rejects for insufficient balance in the xyz pool even when the main dex is well funded", async () => {
      fetchClearinghouseState.mockImplementation(async (_address: string, dex?: string) => ({
        ok: true,
        data: {
          assetPositions: [],
          marginSummary: { accountValue: dex === "xyz" ? "1" : "1000000", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" },
          withdrawable: dex === "xyz" ? "1" : "1000000",
          time: Date.now(),
        },
      }));

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", XYZ_ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("EXPERIMENTAL (2026-09-04, unverified live): applies the Unified Account Mode override to an xyz order's balance check too, rescuing an underfunded isolated pool — Hyperliquid's own testnet UI showed a unified wallet's full main balance as directly usable on a HIP-3 dex page with no transfer ever performed; Hyperliquid's own ledger remains the real authority regardless of what this pre-flight concludes", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });
      fetchClearinghouseState.mockImplementation(async (_address: string, dex?: string) =>
        dex === "xyz"
          ? {
              ok: true,
              data: { assetPositions: [], marginSummary: { accountValue: "0", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "0", time: Date.now() },
            }
          : { ok: true, data: { assetPositions: [], marginSummary: { accountValue: "0", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "0", time: Date.now() } }
      );
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: { balances: [{ coin: "USDC", token: 0, total: "999.0", hold: "0.0", entryNtl: "0.0" }], tokenToAvailableAfterMaintenance: [[0, "999.0"]] },
      });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", XYZ_ORDER_ACTION, NONCE, SIGNATURE);

      expect(result.status).not.toBe("rejected");
    });

    it("still rejects an xyz order when even the Unified Account Mode override's balance is insufficient", async () => {
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { assetPositions: [], marginSummary: { accountValue: "0", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "0", time: Date.now() },
      });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: { balances: [{ coin: "USDC", token: 0, total: "1.0", hold: "0.0", entryNtl: "0.0" }], tokenToAvailableAfterMaintenance: [[0, "1.0"]] },
      });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", XYZ_ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("keeps checking the xyz dex's own isolated balance for a classic (non-unified) account, unaffected by this change", async () => {
      fetchClearinghouseState.mockImplementation(async (_address: string, dex?: string) => ({
        ok: true,
        data: {
          assetPositions: [],
          marginSummary: { accountValue: dex === "xyz" ? "1" : "1000000", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" },
          withdrawable: dex === "xyz" ? "1" : "1000000",
          time: Date.now(),
        },
      }));
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: null }); // not unified

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", XYZ_ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("still applies the Phase 7 education gate — locked without a completed course/quiz/practice trade for aapl specifically", async () => {
      getServerLearningProgress.mockResolvedValue(REAL_TRADING_UNLOCKED_PROGRESS); // btc/eth done, NOT aapl

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", XYZ_ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "real-trading-locked", message: expect.any(String) });
    });

    it("busts only the xyz dex's cache after a successful xyz order, not the main dex's", async () => {
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { assetPositions: [], marginSummary: { accountValue: "10000", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "10000", time: Date.now() },
      });
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

      await getHyperliquidAccount("0xabc"); // populate main-dex cache
      await getHyperliquidAccount("0xabc", "xyz"); // populate xyz-dex cache
      const callsBeforeMain = fetchClearinghouseState.mock.calls.length;

      await submitHyperliquidExchangeAction(USER_ID, "0xabc", XYZ_ORDER_ACTION, NONCE, SIGNATURE);

      await getHyperliquidAccount("0xabc"); // main dex — should still be cached
      const callsAfterMain = fetchClearinghouseState.mock.calls.length;
      await getHyperliquidAccount("0xabc", "xyz"); // xyz dex — must be busted, refetches
      const callsAfterXyz = fetchClearinghouseState.mock.calls.length;

      expect(callsAfterMain).toBe(callsBeforeMain + 1); // the order's own fresh pre-flight check, not a cache read
      expect(callsAfterXyz).toBeGreaterThan(callsAfterMain);
    });
  });

  // Phase 8 — the collateral transfer that funds/withdraws a HIP-3 dex's
  // isolated margin pool, reusing the exact same signed-action relay path
  // as every other action here (no second execution system).
  describe("sendAsset (Phase 8) — collateral transfer between the main dex and a HIP-3 dex", () => {
    const USDC_TOKEN_ID = "USDC:0x6d1e7cde53ba9467b783cb7c530ce054";

    function transferAction(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        type: "sendAsset",
        signatureChainId: "0xa4b1",
        hyperliquidChain: "Mainnet",
        destination: "0xabc",
        sourceDex: "",
        destinationDex: "xyz",
        token: USDC_TOKEN_ID,
        amount: "25",
        fromSubAccount: "",
        nonce: NONCE,
        ...overrides,
      };
    }

    beforeEach(() => {
      fetchPerpDexs.mockResolvedValue({
        ok: true,
        data: [null, { name: "xyz", fullName: "XYZ", deployer: "0x888…", oracleUpdater: null }],
      });
      fetchSpotMeta.mockResolvedValue({
        ok: true,
        data: { tokens: [{ name: "USDC", index: 0, tokenId: "0x6d1e7cde53ba9467b783cb7c530ce054" }] },
      });
      // Default: the source pool is well funded — tests about shape/
      // destination/dex/token validation don't also have to be about the
      // balance check. Tests that ARE about it override this per-case.
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { assetPositions: [], marginSummary: { accountValue: "10000", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "10000", time: Date.now() },
      });
    });

    it("relays a valid main→xyz transfer and classifies the response like any other action", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction(), NONCE, SIGNATURE);

      expect(result).toEqual({ status: "pending" });
      expect(postExchange).toHaveBeenCalledWith({ action: transferAction(), nonce: NONCE, signature: SIGNATURE });
    });

    it("relays a valid xyz→main (withdraw) transfer the same way", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });
      const withdrawAction = transferAction({ sourceDex: "xyz", destinationDex: "" });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", withdrawAction, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "pending" });
      expect(postExchange).toHaveBeenCalled();
    });

    it("never checks the asset/leverage/education gate — sendAsset has no market concept", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });

      await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction(), NONCE, SIGNATURE);

      expect(getServerLearningProgress).not.toHaveBeenCalled();
      expect(fetchMeta).not.toHaveBeenCalled();
    });

    it("rejects a transfer whose destination isn't the caller's own address — even though this is signed by the wallet, the relay refuses to forward a mismatched payload", async () => {
      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ destination: "0xattacker000000000000000000000000000000" }),
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "rejected", reason: "invalid-transfer", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("accepts a destination that differs only in case — addresses are compared case-insensitively", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });

      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xABC",
        transferAction({ destination: "0xabc" }),
        NONCE,
        SIGNATURE
      );

      expect(result.status).not.toBe("rejected");
    });

    it("rejects a transfer naming a dex this app doesn't configure", async () => {
      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ destinationDex: "some-random-dex" }),
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "rejected", reason: "invalid-transfer", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("accepts \"spot\" as a valid sourceDex — the real Hyperliquid value a Unified Account transfer must use instead of \"\"", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "792.50", hold: "0.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "792.50"]],
        },
      });

      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ sourceDex: "spot", destinationDex: "xyz", amount: "100" }),
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "pending" });
      expect(postExchange).toHaveBeenCalled();
    });

    it("checks the real spot balance (not clearinghouseState) for a \"spot\" source, and rejects when it's insufficient", async () => {
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "10", hold: "0.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "10"]],
        },
      });

      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ sourceDex: "spot", destinationDex: "xyz", amount: "100" }),
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
      expect(fetchClearinghouseState).not.toHaveBeenCalled();
    });

    it("rejects a \"spot\" source when the account isn't actually unified — can't verify a balance that doesn't apply", async () => {
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: null });

      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ sourceDex: "spot", destinationDex: "xyz" }),
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "rejected", reason: "invalid-request", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("invalidates the main (not a literal \"spot\") account cache entry after a \"spot\"-sourced transfer", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "792.50", hold: "0.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "792.50"]],
        },
      });

      await getHyperliquidAccount("0xabc"); // populate the real "main" cache entry
      const callsBefore = fetchClearinghouseState.mock.calls.length;

      await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ sourceDex: "spot", destinationDex: "xyz", amount: "100" }),
        NONCE,
        SIGNATURE
      );

      await getHyperliquidAccount("0xabc"); // must NOT be served stale — "spot" must map to the real "main" cache key
      expect(fetchClearinghouseState.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it("rejects a transfer whose source and destination are the same", async () => {
      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ sourceDex: "xyz", destinationDex: "xyz" }),
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "rejected", reason: "invalid-transfer", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("rejects a transfer of any token other than the real, live-resolved USDC id", async () => {
      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ token: "PURR:0xc4bf3f870c0e9465323c0b6ed28096c2" }),
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "rejected", reason: "invalid-transfer", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("rejects when the live USDC token id can't be resolved at all", async () => {
      fetchSpotMeta.mockResolvedValue({ ok: false, reason: "network_error", message: "down" });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction(), NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "invalid-transfer", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("rejects a zero or negative amount", async () => {
      const zero = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction({ amount: "0" }), NONCE, SIGNATURE);
      expect(zero).toEqual({ status: "rejected", reason: "invalid-request", message: expect.any(String) });

      const negative = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction({ amount: "-5" }), NONCE, SIGNATURE);
      expect(negative).toEqual({ status: "rejected", reason: "invalid-request", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("rejects a transfer whose amount exceeds the SOURCE pool's own balance", async () => {
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          assetPositions: [],
          marginSummary: { accountValue: "1", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" },
          withdrawable: "1", // underfunded relative to the "25" requested
          time: Date.now(),
        },
      });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction(), NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("checks the SOURCE dex's balance specifically — a well-funded destination never rescues an underfunded source", async () => {
      // Withdraw direction: source is "xyz" (underfunded), destination is
      // "" (well-funded main dex) — must still be rejected.
      fetchClearinghouseState.mockImplementation(async (_address: string, dex?: string) => ({
        ok: true,
        data: {
          assetPositions: [],
          marginSummary: { accountValue: "0", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" },
          withdrawable: dex === "xyz" ? "1" : "1000000",
          time: Date.now(),
        },
      }));

      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ sourceDex: "xyz", destinationDex: "" }),
        NONCE,
        SIGNATURE
      );

      expect(fetchClearinghouseState).toHaveBeenCalledWith("0xabc", "xyz");
      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
    });

    it("uses the Unified Account Mode spot balance override for a main→xyz transfer, not the stale classic withdrawable — real, reported bug: a well-funded unified-account wallet got rejected as insufficient", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });
      // Classic clearinghouseState says withdrawable=0 — same stale value
      // getUnifiedAccountOverride exists to correct elsewhere.
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { assetPositions: [], marginSummary: { accountValue: "0", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "0", time: Date.now() },
      });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "792.50", hold: "0.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "792.50"]],
        },
      });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction({ amount: "100" }), NONCE, SIGNATURE);

      expect(result).toEqual({ status: "pending" });
      expect(postExchange).toHaveBeenCalled();
    });

    it("still rejects a main→xyz transfer that exceeds the Unified Account Mode spot balance, not just the classic one", async () => {
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { assetPositions: [], marginSummary: { accountValue: "0", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "10000", time: Date.now() },
      });
      fetchUserAbstraction.mockResolvedValue({ ok: true, data: "unifiedAccount" });
      fetchSpotClearinghouseState.mockResolvedValue({
        ok: true,
        data: {
          balances: [{ coin: "USDC", token: 0, total: "10", hold: "0.0", entryNtl: "0.0" }],
          tokenToAvailableAfterMaintenance: [[0, "10"]],
        },
      });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction({ amount: "100" }), NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("does not apply the Unified Account Mode override when the source is a HIP-3 dex, not the main dex — same scoping as getHyperliquidAccount", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { assetPositions: [], marginSummary: { accountValue: "0", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "1000", time: Date.now() },
      });

      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        transferAction({ sourceDex: "xyz", destinationDex: "", amount: "100" }),
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "pending" });
      expect(fetchUserAbstraction).not.toHaveBeenCalled();
    });

    it("rejects a malformed transfer shape (missing fields) before ever contacting Hyperliquid", async () => {
      const result = await submitHyperliquidExchangeAction(
        USER_ID,
        "0xabc",
        { type: "sendAsset", destination: "0xabc" }, // missing sourceDex/destinationDex/token/amount
        NONCE,
        SIGNATURE
      );

      expect(result).toEqual({ status: "rejected", reason: "invalid-request", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("still returns rejected/disabled when the flag is off — the top-level gate applies to sendAsset too", async () => {
      process.env.HYPERLIQUID_ENABLED = "false";

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction(), NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "disabled", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("busts BOTH the source and destination dex caches after a successful transfer", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default" } } });
      fetchClearinghouseState.mockResolvedValue({
        ok: true,
        data: { assetPositions: [], marginSummary: { accountValue: "10000", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "0" }, withdrawable: "10000", time: Date.now() },
      });

      await getHyperliquidAccount("0xabc"); // populate main cache
      await getHyperliquidAccount("0xabc", "xyz"); // populate xyz cache
      const callsBefore = fetchClearinghouseState.mock.calls.length;

      await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction(), NONCE, SIGNATURE);

      await getHyperliquidAccount("0xabc");
      await getHyperliquidAccount("0xabc", "xyz");
      // +1 for the transfer's own fresh source-balance pre-flight check,
      // +2 for both dex caches being busted and refetched — neither
      // served stale.
      expect(fetchClearinghouseState.mock.calls.length).toBe(callsBefore + 3);
    });

    it("classifies a Hyperliquid-side rejection of the transfer the same as any other action", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "err", response: "Insufficient balance" } });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction(), NONCE, SIGNATURE);

      expect(result).toEqual({ status: "hyperliquid-rejected", message: "Insufficient balance" });
    });

    it("reports network-failure (never a hard failure) when Hyperliquid can't be reached", async () => {
      postExchange.mockResolvedValue({ ok: false, reason: "network_error", message: "timed out" });

      const result = await submitHyperliquidExchangeAction(USER_ID, "0xabc", transferAction(), NONCE, SIGNATURE);

      expect(result).toEqual({ status: "network-failure", message: "timed out" });
    });
  });
});
