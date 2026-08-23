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

describe("submitHyperliquidExchangeAction — real order execution (Phase 4)", () => {
  const UPDATE_LEVERAGE_ACTION = { type: "updateLeverage", asset: 0, isCross: true, leverage: 5 };
  const ORDER_ACTION = {
    type: "order",
    orders: [{ a: 0, b: true, p: "60000", s: "0.01", r: false, t: { limit: { tif: "FrontendMarket" } } }],
    grouping: "na",
  };
  const SIGNATURE = { r: "0xaaa", s: "0xbbb", v: 27 as const };
  const NONCE = 1_700_000_000_000;

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
  });

  it("returns rejected/disabled and never calls the client when the flag is off", async () => {
    process.env.HYPERLIQUID_ENABLED = "false";

    const result = await submitHyperliquidExchangeAction("0xabc", UPDATE_LEVERAGE_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "rejected", reason: "disabled", message: expect.any(String) });
    expect(fetchMeta).not.toHaveBeenCalled();
    expect(postExchange).not.toHaveBeenCalled();
  });

  it("rejects an action type outside the exact allowlist, never contacting Hyperliquid", async () => {
    const result = await submitHyperliquidExchangeAction(
      "0xabc",
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
      "0xabc",
      { type: "updateLeverage", asset: 0, isCross: true, leverage: 5 },
      NONCE,
      SIGNATURE
    );

    expect(result).toEqual({ status: "rejected", reason: "unknown-coin", message: expect.any(String) });
    expect(postExchange).not.toHaveBeenCalled();
  });

  it("rejects leverage above the coin's real max leverage", async () => {
    const result = await submitHyperliquidExchangeAction(
      "0xabc",
      { type: "updateLeverage", asset: 0, isCross: true, leverage: 999 }, // BTC max is 50 in RAW_META
      NONCE,
      SIGNATURE
    );

    expect(result).toEqual({ status: "rejected", reason: "leverage-exceeds-max", message: expect.any(String) });
    expect(postExchange).not.toHaveBeenCalled();
  });

  it("rejects an order whose notional exceeds what the account's balance could support even at max leverage", async () => {
    mockAccountBalance("1"); // $1 available, max leverage 50x -> max notional $50; order here is 0.01 * 60000 = $600

    const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

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

    const result = await submitHyperliquidExchangeAction("0xabc", reduceOnlyAction, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "resting", orderId: 1 });
    expect(fetchClearinghouseState).not.toHaveBeenCalled();
    expect(postExchange).toHaveBeenCalled();
  });

  it("still applies the balance pre-flight check to a normal (non reduce-only) order — the exemption isn't a blanket bypass", async () => {
    mockAccountBalance("1"); // same underfunded case as the test above, but r:false this time

    const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
    expect(postExchange).not.toHaveBeenCalled();
  });

  it("uses a FRESH balance check on every call, never a cached one — two calls hit fetchClearinghouseState twice", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

    await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);
    await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE + 1, SIGNATURE);

    expect(fetchClearinghouseState).toHaveBeenCalledTimes(2);
  });

  it("forwards the action object byte-identical to postExchange — never reconstructed", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "order", data: {} } } });

    await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(postExchange).toHaveBeenCalledWith({ action: ORDER_ACTION, nonce: NONCE, signature: SIGNATURE });
    // Same object reference, not a rebuilt copy.
    expect(postExchange.mock.calls[0][0].action).toBe(ORDER_ACTION);
  });

  it("classifies a plain ok response (updateLeverage) as pending", async () => {
    postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default", data: {} } } });

    const result = await submitHyperliquidExchangeAction("0xabc", UPDATE_LEVERAGE_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "pending" });
  });

  it("classifies a resting order status", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({
      ok: true,
      data: { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 77738308 } }] } } },
    });

    const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

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

    const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

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

    const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "hyperliquid-rejected", message: "Order must have minimum value of $10." });
  });

  it("classifies a top-level Hyperliquid rejection (e.g. bad signature)", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({ ok: true, data: { status: "err", response: "Invalid signature" } });

    const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

    expect(result).toEqual({ status: "hyperliquid-rejected", message: "Invalid signature" });
  });

  it("classifies a transport/network failure as network-failure — never a hard 'rejected'", async () => {
    mockAccountBalance("100000");
    postExchange.mockResolvedValue({ ok: false, reason: "network_error", message: "timed out" });

    const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

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

      const result = await submitHyperliquidExchangeAction("0xabc", APPROVE_AGENT_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "pending" });
      expect(fetchMeta).not.toHaveBeenCalled();
      expect(fetchClearinghouseState).not.toHaveBeenCalled();
    });

    it("forwards the action byte-identical to postExchange, same as every other action type", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "ok", response: { type: "default", data: {} } } });

      await submitHyperliquidExchangeAction("0xabc", APPROVE_AGENT_ACTION, NONCE, SIGNATURE);

      expect(postExchange).toHaveBeenCalledWith({ action: APPROVE_AGENT_ACTION, nonce: NONCE, signature: SIGNATURE });
      expect(postExchange.mock.calls[0][0].action).toBe(APPROVE_AGENT_ACTION);
    });

    it("still returns rejected/disabled when the flag is off — the top-level gate applies to every action type", async () => {
      process.env.HYPERLIQUID_ENABLED = "false";

      const result = await submitHyperliquidExchangeAction("0xabc", APPROVE_AGENT_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "disabled", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });

    it("classifies a Hyperliquid-side rejection of the approval the same as any other action", async () => {
      postExchange.mockResolvedValue({ ok: true, data: { status: "err", response: "Invalid signature" } });

      const result = await submitHyperliquidExchangeAction("0xabc", APPROVE_AGENT_ACTION, NONCE, SIGNATURE);

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
      const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

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

      const result = await submitHyperliquidExchangeAction("0xabc", ORDER_ACTION, NONCE, SIGNATURE);

      expect(result).toEqual({ status: "rejected", reason: "insufficient-balance", message: expect.any(String) });
      expect(postExchange).not.toHaveBeenCalled();
    });
  });
});
