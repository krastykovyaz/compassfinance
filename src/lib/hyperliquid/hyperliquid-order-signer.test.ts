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
    provider: mockProvider(),
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
