import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMetaAndAssetCtxs = vi.fn();
const fetchCandleSnapshot = vi.fn();
const fetchL2Book = vi.fn();
const fetchClearinghouseState = vi.fn();
const fetchOpenOrders = vi.fn();
const fetchUserFills = vi.fn();

vi.mock("./client", () => ({
  fetchMetaAndAssetCtxs: (...args: unknown[]) => fetchMetaAndAssetCtxs(...args),
  fetchCandleSnapshot: (...args: unknown[]) => fetchCandleSnapshot(...args),
  fetchL2Book: (...args: unknown[]) => fetchL2Book(...args),
  fetchClearinghouseState: (...args: unknown[]) => fetchClearinghouseState(...args),
  fetchOpenOrders: (...args: unknown[]) => fetchOpenOrders(...args),
  fetchUserFills: (...args: unknown[]) => fetchUserFills(...args),
}));

import { clearMarketCache } from "@/server/market/cache";
import {
  getHyperliquidMarkets,
  getHyperliquidCandles,
  getHyperliquidOrderBook,
  getHyperliquidAccount,
  getHyperliquidOpenOrders,
  getHyperliquidUserFills,
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

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  clearMarketCache();
  process.env.HYPERLIQUID_ENABLED = "true";
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
