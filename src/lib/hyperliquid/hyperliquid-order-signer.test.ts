import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signL1Action = vi.fn();
vi.mock("@nktkas/hyperliquid/signing", () => ({
  signL1Action: (...args: unknown[]) => signL1Action(...args),
}));

import {
  computeSlippageLimitPrice,
  computeOrderSizeUnits,
  nextNonce,
  buildUpdateLeverageAction,
  buildMarketOrderAction,
  createHyperliquidWalletAdapter,
  signAndSubmitPerpOrder,
  signingErrorDetail,
  closePosition,
  closingOrderParamsForPosition,
  checkPartialFill,
  SLIPPAGE_TOLERANCE,
} from "./hyperliquid-order-signer";
import type { Eip1193Provider } from "@/lib/wallet/wallet-types";

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

function mockProvider(overrides?: Partial<{ request: (args: unknown) => Promise<unknown> }>): Eip1193Provider {
  return {
    request: vi.fn(async () => "0xsignature"),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("computeSlippageLimitPrice", () => {
  it("for a long, is ABOVE mark price (willing to pay more)", () => {
    expect(computeSlippageLimitPrice(60000, "long")).toBeCloseTo(60000 * (1 + SLIPPAGE_TOLERANCE), 5);
  });

  it("for a short, is BELOW mark price (willing to receive less)", () => {
    expect(computeSlippageLimitPrice(60000, "short")).toBeCloseTo(60000 * (1 - SLIPPAGE_TOLERANCE), 5);
  });

  it("accepts a custom slippage tolerance", () => {
    expect(computeSlippageLimitPrice(100, "long", 0.05)).toBeCloseTo(105, 5);
    expect(computeSlippageLimitPrice(100, "short", 0.05)).toBeCloseTo(95, 5);
  });
});

describe("signingErrorDetail", () => {
  it("unwraps AbstractWalletError's cause to surface the wallet's own real error message", () => {
    const walletCrash = new TypeError("undefined is not a function");
    const wrapped = new Error("Failed to sign the typed data using the wallet", { cause: walletCrash });
    expect(signingErrorDetail(wrapped)).toBe("undefined is not a function");
  });

  it("falls back to the error's own message when there's no cause", () => {
    expect(signingErrorDetail(new Error("plain failure"))).toBe("plain failure");
  });

  it("stringifies a non-Error thrown value rather than crashing on it", () => {
    expect(signingErrorDetail("raw string throw")).toBe("raw string throw");
  });

  it("reads .message off a plain (non-Error) rejection object — the reported bug: Coinbase Wallet's chainId-mismatch rejection is shaped exactly like this, and String() on it alone gives '[object Object]'", () => {
    const walletCrash = { message: "Active chainId is 0xa4b1 but received 0x539" };
    const wrapped = new Error("Failed to sign the typed data using the wallet", { cause: walletCrash });
    expect(signingErrorDetail(wrapped)).toBe("Active chainId is 0xa4b1 but received 0x539");
  });
});

describe("nextNonce — strictly increasing across two signed actions", () => {
  it("returns roughly the current time when no prior nonce is given", () => {
    const before = Date.now();
    const nonce = nextNonce();
    expect(nonce).toBeGreaterThanOrEqual(before);
  });

  it("is always greater than the prior nonce, even if called in the same millisecond", () => {
    const leverageNonce = Date.now();
    const orderNonce = nextNonce(leverageNonce);
    expect(orderNonce).toBeGreaterThan(leverageNonce);
  });

  it("uses the current time when it's already ahead of the prior nonce", () => {
    const farInThePast = 1_000_000;
    const nonce = nextNonce(farInThePast);
    expect(nonce).toBeGreaterThan(farInThePast);
    expect(nonce).toBeGreaterThan(Date.now() - 1000);
  });
});

describe("computeOrderSizeUnits", () => {
  it("matches margin*leverage / price", () => {
    expect(computeOrderSizeUnits(100, 5, 60000)).toBeCloseTo((100 * 5) / 60000, 8);
  });
});

describe("buildUpdateLeverageAction", () => {
  it("builds the exact Hyperliquid updateLeverage action shape", () => {
    expect(buildUpdateLeverageAction({ assetIndex: 0, leverage: 5 })).toEqual({
      type: "updateLeverage",
      asset: 0,
      isCross: true,
      leverage: 5,
    });
  });

  it("defaults to cross margin unless isCross is explicitly overridden", () => {
    expect(buildUpdateLeverageAction({ assetIndex: 1, leverage: 3, isCross: false })).toEqual({
      type: "updateLeverage",
      asset: 1,
      isCross: false,
      leverage: 3,
    });
  });
});

describe("buildMarketOrderAction", () => {
  it("builds a single-order 'order' action with FrontendMarket tif, not reduce-only, no grouping", () => {
    const action = buildMarketOrderAction({
      assetIndex: 0,
      side: "long",
      markPrice: 60000,
      sizeUnits: 0.016666,
      szDecimals: 5,
    });
    expect(action.type).toBe("order");
    expect(action.grouping).toBe("na");
    const orders = action.orders as Record<string, unknown>[];
    expect(orders).toHaveLength(1);
    expect(orders[0].a).toBe(0);
    expect(orders[0].b).toBe(true); // long -> buy
    expect(orders[0].r).toBe(false);
    expect(orders[0].t).toEqual({ limit: { tif: "FrontendMarket" } });
  });

  it("sets b:false for a short", () => {
    const action = buildMarketOrderAction({
      assetIndex: 0,
      side: "short",
      markPrice: 60000,
      sizeUnits: 0.01,
      szDecimals: 5,
    });
    const orders = action.orders as Record<string, unknown>[];
    expect(orders[0].b).toBe(false);
  });

  it("sets r:true when reduceOnly is passed — closing a position must never be able to open new exposure", () => {
    const action = buildMarketOrderAction({
      assetIndex: 0,
      side: "short",
      markPrice: 60000,
      sizeUnits: 0.01,
      szDecimals: 5,
      reduceOnly: true,
    });
    const orders = action.orders as Record<string, unknown>[];
    expect(orders[0].r).toBe(true);
  });

  it("defaults r:false when reduceOnly is omitted — unchanged prior behavior for opening/adding to a position", () => {
    const action = buildMarketOrderAction({
      assetIndex: 0,
      side: "short",
      markPrice: 60000,
      sizeUnits: 0.01,
      szDecimals: 5,
    });
    const orders = action.orders as Record<string, unknown>[];
    expect(orders[0].r).toBe(false);
  });

  it("formats price/size to real, tick-valid strings via the tick/lot rules (not raw floats)", () => {
    // BTC-like szDecimals=5, MAX_DECIMALS=6 for perps -> price allows at
    // most 1 decimal place and 5 significant figures.
    const action = buildMarketOrderAction({
      assetIndex: 0,
      side: "long",
      markPrice: 60123.456789,
      sizeUnits: 0.0166669999,
      szDecimals: 5,
    });
    const orders = action.orders as Record<string, unknown>[];
    expect(typeof orders[0].p).toBe("string");
    expect(typeof orders[0].s).toBe("string");
    // Real tick rule: at most 5 significant figures for a non-integer price.
    expect((orders[0].p as string).replace(".", "").replace(/^0+/, "").length).toBeLessThanOrEqual(5);
  });
});

describe("createHyperliquidWalletAdapter", () => {
  it("getAddresses resolves to the single connected address", async () => {
    const adapter = createHyperliquidWalletAdapter(mockProvider(), "0xabc");
    await expect(adapter.getAddresses()).resolves.toEqual(["0xabc"]);
  });

  it("getChainId resolves via the provider's eth_chainId", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0x1") });
    const adapter = createHyperliquidWalletAdapter(provider, "0xabc");
    await expect(adapter.getChainId()).resolves.toBe(1);
  });

  it("signTypedData calls eth_signTypedData_v4 with the connected address and returns the wallet's real signature", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0xrealsig") });
    const adapter = createHyperliquidWalletAdapter(provider, "0xabc");

    const sig = await adapter.signTypedData({
      domain: { name: "Exchange", version: "1", chainId: 1337, verifyingContract: "0x0" },
      types: { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] },
      primaryType: "Agent",
      message: { source: "a", connectionId: "0xdeadbeef" },
    });

    expect(sig).toBe("0xrealsig");
    expect(provider.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_signTypedData_v4", params: ["0xabc", expect.any(String)] })
    );
  });
});

describe("signAndSubmitPerpOrder — orchestration", () => {
  const BASE_PARAMS = {
    wallet: createHyperliquidWalletAdapter(mockProvider(), "0xabc"),
    address: "0xabc",
    assetIndex: 0,
    szDecimals: 5,
    side: "long" as const,
    marginUsdc: 100,
    leverage: 5,
    markPrice: 60000,
    isTestnet: false,
  };
  const SIGNATURE = { r: "0xaaa", s: "0xbbb", v: 27 };

  beforeEach(() => {
    signL1Action.mockReset();
  });

  it("signs leverage then order, in that order, with a strictly increasing nonce", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ result: { status: "resting", orderId: 1 } }))
    );

    const result = await signAndSubmitPerpOrder(BASE_PARAMS);

    expect(signL1Action).toHaveBeenCalledTimes(2);
    const leverageCall = signL1Action.mock.calls[0][0];
    const orderCall = signL1Action.mock.calls[1][0];
    expect(leverageCall.action.type).toBe("updateLeverage");
    expect(orderCall.action.type).toBe("order");
    expect(orderCall.nonce).toBeGreaterThan(leverageCall.nonce);
    expect(result).toEqual({ status: "resting", orderId: 1 });
  });

  it("is signer-agnostic — works identically given any AbstractWallet-shaped signer, not just the browser-wallet adapter (Phase 5: an agent's local account passes the same way)", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "resting", orderId: 1 } })));
    const localAccountShapedSigner = {
      signTypedData: vi.fn(async (): Promise<`0x${string}`> => "0xsig"),
      address: "0xagent" as `0x${string}`,
    };

    const result = await signAndSubmitPerpOrder({ ...BASE_PARAMS, wallet: localAccountShapedSigner });

    expect(signL1Action.mock.calls[0][0].wallet).toBe(localAccountShapedSigner);
    expect(result).toEqual({ status: "resting", orderId: 1 });
  });

  it("passes isTestnet through to both signL1Action calls", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));

    await signAndSubmitPerpOrder({ ...BASE_PARAMS, isTestnet: true });

    for (const call of signL1Action.mock.calls) {
      expect(call[0].isTestnet).toBe(true);
    }
  });

  it("stops immediately (never signs the order) when the user rejects the LEVERAGE signature", async () => {
    signL1Action.mockRejectedValueOnce({ code: 4001, message: "User rejected" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await signAndSubmitPerpOrder(BASE_PARAMS);

    expect(result).toEqual({ status: "wallet-rejected" });
    expect(signL1Action).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the real underlying error message (not a generic one) when signing the leverage update fails for a reason other than user-rejection — the reported bug", async () => {
    signL1Action.mockRejectedValueOnce(
      new Error("Failed to sign the typed data using the wallet", {
        cause: new TypeError("undefined is not a function"),
      })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await signAndSubmitPerpOrder(BASE_PARAMS);

    expect(result).toEqual({
      status: "rejected",
      reason: "invalid-request",
      message: "Couldn't sign the leverage update: undefined is not a function",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops immediately when the user rejects the ORDER signature, after leverage already succeeded", async () => {
    signL1Action.mockResolvedValueOnce(SIGNATURE).mockRejectedValueOnce({ code: 4001, message: "User rejected" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));

    const result = await signAndSubmitPerpOrder(BASE_PARAMS);

    expect(result).toEqual({ status: "wallet-rejected" });
    expect(signL1Action).toHaveBeenCalledTimes(2);
  });

  it("stops and reports the leverage result when Hyperliquid rejects the leverage update — never signs the order on top of it", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ result: { status: "hyperliquid-rejected", message: "leverage too high" } })
      )
    );

    const result = await signAndSubmitPerpOrder(BASE_PARAMS);

    expect(result).toEqual({ status: "hyperliquid-rejected", message: "leverage too high" });
    expect(signL1Action).toHaveBeenCalledTimes(1); // never signed the order
  });

  it("classifies a network failure talking to our own route as network-failure, never a hard error", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection reset")));

    const result = await signAndSubmitPerpOrder(BASE_PARAMS);

    expect(result.status).toBe("network-failure");
  });

  it("classifies a non-200 from our own route as a real (non-ambiguous) rejection", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Too many requests" }, { ok: false, status: 429 }))
    );

    const result = await signAndSubmitPerpOrder(BASE_PARAMS);

    expect(result.status).toBe("rejected");
  });

  it("returns the final ORDER result (filled), not the intermediate leverage result", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: { status: "pending" } })) // leverage
      .mockResolvedValueOnce(
        jsonResponse({ result: { status: "filled", orderId: 5, totalSize: 0.01, avgPrice: 60050 } })
      ); // order
    vi.stubGlobal("fetch", fetchMock);

    const result = await signAndSubmitPerpOrder(BASE_PARAMS);

    expect(result).toEqual({ status: "filled", orderId: 5, totalSize: 0.01, avgPrice: 60050 });
  });
});

describe("closingOrderParamsForPosition — pure derivation, never user-editable", () => {
  it("a long position (positive size) closes via a SHORT of the same absolute size", () => {
    expect(closingOrderParamsForPosition(0.00126)).toEqual({ side: "short", sizeUnits: 0.00126 });
  });

  it("a short position (negative size) closes via a LONG of the same absolute size", () => {
    expect(closingOrderParamsForPosition(-0.5)).toEqual({ side: "long", sizeUnits: 0.5 });
  });

  it("treats an exact-zero size as a long-side close (>=0), matching HyperliquidPosition's own sign convention", () => {
    expect(closingOrderParamsForPosition(0)).toEqual({ side: "short", sizeUnits: 0 });
  });
});

describe("checkPartialFill — partial-vs-full fill detection (opening and closing/reducing)", () => {
  it("returns null for every non-'filled' status — nothing to compare, existing result handling covers these", () => {
    expect(checkPartialFill({ status: "wallet-rejected" }, 1, 5, 1)).toBeNull();
    expect(checkPartialFill({ status: "resting", orderId: 1 }, 1, 5, 1)).toBeNull();
    expect(checkPartialFill({ status: "pending" }, 1, 5, 1)).toBeNull();
    expect(checkPartialFill({ status: "network-failure", message: "x" }, 1, 5, 1)).toBeNull();
    expect(checkPartialFill({ status: "hyperliquid-rejected", message: "x" }, 1, 5, 1)).toBeNull();
    expect(checkPartialFill({ status: "rejected", reason: "invalid-request", message: "x" }, 1, 5, 1)).toBeNull();
  });

  it("reports isPartial:false when the filled amount matches the requested amount exactly", () => {
    const result = checkPartialFill({ status: "filled", orderId: 1, totalSize: 0.5, avgPrice: 60000 }, 0.5, 5, 0.5);
    expect(result).toEqual({ isPartial: false, filledSize: 0.5, remainingSize: 0 });
  });

  it("reports isPartial:true when the filled amount comes in short of what was requested — the reported bug", () => {
    // Position was 1.0, user requested closing 0.6, only 0.4 actually filled.
    const result = checkPartialFill({ status: "filled", orderId: 1, totalSize: 0.4, avgPrice: 60000 }, 0.6, 5, 1.0);
    expect(result).toEqual({ isPartial: true, filledSize: 0.4, remainingSize: 0.6 });
  });

  it("a full close (requested === full position size) that fills completely leaves zero remaining", () => {
    const result = checkPartialFill({ status: "filled", orderId: 1, totalSize: 1.0, avgPrice: 60000 }, 1.0, 5, 1.0);
    expect(result).toEqual({ isPartial: false, filledSize: 1.0, remainingSize: 0 });
  });

  it("tolerates sub-epsilon rounding noise from tick formatting without flagging it as partial", () => {
    // requestedSize round-trips through formatSize's tick rules before
    // submission; a fully-filled real order can report totalSize a hair
    // under what was asked without this ever being a genuine partial fill.
    const result = checkPartialFill({ status: "filled", orderId: 1, totalSize: 0.4999999999, avgPrice: 60000 }, 0.5, 5, 0.5);
    expect(result?.isPartial).toBe(false);
  });

  it("does NOT tolerate a real, meaningfully short fill just because it's close to the epsilon boundary", () => {
    const result = checkPartialFill({ status: "filled", orderId: 1, totalSize: 0.499, avgPrice: 60000 }, 0.5, 5, 0.5);
    expect(result?.isPartial).toBe(true);
  });

  it("computes remainingSize from the position size BEFORE this close, not from the requested amount", () => {
    // Position was 2.0; user only requested reducing by 0.5; all 0.5 filled.
    // Remaining should be 1.5 (2.0 - 0.5), not 0 and not based on the request alone.
    const result = checkPartialFill({ status: "filled", orderId: 1, totalSize: 0.5, avgPrice: 60000 }, 0.5, 5, 2.0);
    expect(result).toEqual({ isPartial: false, filledSize: 0.5, remainingSize: 1.5 });
  });

  it("omits remainingSize entirely when positionSizeBeforeClose isn't given — the OPENING case, where there's no prior position being reduced", () => {
    const partial = checkPartialFill({ status: "filled", orderId: 1, totalSize: 0.4, avgPrice: 60000 }, 0.6, 5);
    expect(partial).toEqual({ isPartial: true, filledSize: 0.4, remainingSize: undefined });

    const full = checkPartialFill({ status: "filled", orderId: 1, totalSize: 0.6, avgPrice: 60000 }, 0.6, 5);
    expect(full).toEqual({ isPartial: false, filledSize: 0.6, remainingSize: undefined });
  });

  it("regression: a raw, pre-truncation requestedSize (margin*leverage/price) that fully filled must NOT be flagged partial", () => {
    // The real bug: opening $100 notional BTC at ~$78,626 gives a raw
    // requestedSize of 100/78626 = 0.0012718..., but the actual order
    // submitted (and fully filled) was formatSize-truncated to BTC's 5
    // szDecimals: 0.00127. Comparing the raw value directly against the
    // real fill (as the code used to) always found a "gap" on the order
    // of the tick size — 1.8e-6, far bigger than any sane epsilon — and
    // mislabeled every fully-filled order as partial.
    const rawRequestedSize = 100 / 78626;
    const result = checkPartialFill(
      { status: "filled", orderId: 1, totalSize: 0.00127, avgPrice: 78626 },
      rawRequestedSize,
      5
    );
    expect(result).toEqual({ isPartial: false, filledSize: 0.00127, remainingSize: undefined });
  });

  it("truncates requestedSize toward zero (formatSize's ROUND_DOWN) before comparing, not round-to-nearest", () => {
    // 0.123456 at szDecimals=2 truncates to 0.12 (not rounds to 0.12 —
    // same result here, but chosen to prove truncation direction below).
    const result = checkPartialFill({ status: "filled", orderId: 1, totalSize: 0.129, avgPrice: 1 }, 0.1299, 2);
    // 0.1299 truncates to 0.12 at 2 decimals; filled 0.129 > quantized
    // requested 0.12, so this "over-fills" relative to the truncated
    // request and must not be flagged partial.
    expect(result?.isPartial).toBe(false);
  });

  it("still detects a genuine partial fill after quantization, not just before it", () => {
    // Requested (quantized) 0.00127 BTC, only 0.001 actually filled.
    const result = checkPartialFill(
      { status: "filled", orderId: 1, totalSize: 0.001, avgPrice: 78626 },
      100 / 78626,
      5
    );
    expect(result?.isPartial).toBe(true);
  });
});

describe("closePosition — orchestration", () => {
  const CLOSE_PARAMS = {
    wallet: createHyperliquidWalletAdapter(mockProvider(), "0xabc"),
    address: "0xabc",
    assetIndex: 0,
    szDecimals: 5,
    side: "short" as const,
    sizeUnits: 0.00126,
    markPrice: 60000,
    isTestnet: false,
  };
  const SIGNATURE = { r: "0xaaa", s: "0xbbb", v: 27 };

  beforeEach(() => {
    signL1Action.mockReset();
  });

  it("signs exactly one reduce-only order — no leverage step at all, closing never changes leverage", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "filled", orderId: 9, totalSize: 0.00126, avgPrice: 60010 } })));

    const result = await closePosition(CLOSE_PARAMS);

    expect(signL1Action).toHaveBeenCalledTimes(1);
    const signed = signL1Action.mock.calls[0][0];
    expect(signed.action.type).toBe("order");
    expect((signed.action.orders as Record<string, unknown>[])[0].r).toBe(true);
    expect(result).toEqual({ status: "filled", orderId: 9, totalSize: 0.00126, avgPrice: 60010 });
  });

  it("classifies a wallet rejection distinctly, without ever calling fetch", async () => {
    signL1Action.mockRejectedValue({ code: 4001, message: "User rejected" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await closePosition(CLOSE_PARAMS);

    expect(result).toEqual({ status: "wallet-rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the real underlying error on a non-rejection signing failure", async () => {
    signL1Action.mockRejectedValue(new Error("boom"));
    vi.stubGlobal("fetch", vi.fn());

    const result = await closePosition(CLOSE_PARAMS);

    expect(result).toEqual({
      status: "rejected",
      reason: "invalid-request",
      message: "Couldn't sign the close order: boom",
    });
  });

  it("classifies a Hyperliquid-side rejection the same way opening an order does", async () => {
    signL1Action.mockResolvedValue(SIGNATURE);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ result: { status: "hyperliquid-rejected", message: "no position to reduce" } }))
    );

    const result = await closePosition(CLOSE_PARAMS);

    expect(result).toEqual({ status: "hyperliquid-rejected", message: "no position to reduce" });
  });
});
