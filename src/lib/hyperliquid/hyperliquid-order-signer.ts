"use client";

// Hyperliquid Trading Phase 4 — real order signing/submission. This is the
// ONLY file (besides evm-wallet-provider.tsx's one new signTypedData
// method) that participates in producing a real Hyperliquid signature.
//
// No signing protocol is invented here: Hyperliquid's own docs explicitly
// recommend against hand-rolling the EIP-712/msgpack "phantom agent"
// construction, so this uses @nktkas/hyperliquid's signL1Action() — a
// client-side-only function that builds the correct message and asks a
// wallet-shaped object to sign it. The actual cryptographic signing still
// happens entirely inside the user's own connected wallet (MetaMask/
// Rabby/WalletConnect all support the standard eth_signTypedData_v4
// method it uses); this module supplies the message, never a key, and
// never sees or stores a private key or seed phrase.
//
// Submission goes through OUR OWN server (/api/hyperliquid/order), never
// directly from the browser to Hyperliquid — same "client never talks to
// Hyperliquid directly" boundary every other phase of this integration
// keeps. The server never signs anything either; it only validates and
// relays what the wallet already signed.

import { signL1Action, type AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import {
  getChainId as getWalletChainId,
  isUserRejectedError,
  signTypedData,
} from "@/lib/wallet/evm-wallet-provider";
import type { Eip1193Provider } from "@/lib/wallet/wallet-types";
import { calculateNotionalValue, calculateEstimatedUnits, type PerpSide } from "./perp-order-calculator";
import type { HyperliquidExchangeResult, HyperliquidSignature } from "./hyperliquid-types";

// Willing to pay/receive up to 1% away from the current mark price for a
// "market" order (Hyperliquid has no true market-order type — this is
// submitted as an IOC-flavored limit order bounded by this tolerance, its
// own frontend's exact convention, see buildMarketOrderAction below).
export const SLIPPAGE_TOLERANCE = 0.01;

// ---------------------------------------------------------------------------
// Pure builders — no wallet, no fetch. Directly testable.
// ---------------------------------------------------------------------------

export function computeSlippageLimitPrice(
  markPrice: number,
  side: PerpSide,
  slippage: number = SLIPPAGE_TOLERANCE
): number {
  // long: willing to pay slightly ABOVE mark. short: willing to receive
  // slightly BELOW mark. Getting this backwards would submit a limit price
  // that likely never fills, or fills far worse than intended — verified
  // against Hyperliquid's own documented order schema, not guessed.
  return side === "long" ? markPrice * (1 + slippage) : markPrice * (1 - slippage);
}

/** Strictly-increasing nonce for a second signed action following one at
 * `after` — Hyperliquid rejects out-of-order/duplicate nonces, and
 * Date.now() called twice in quick succession can collide on the same
 * millisecond, so this can never just be "call Date.now() again". */
export function nextNonce(after?: number): number {
  const now = Date.now();
  return after === undefined ? now : Math.max(now, after + 1);
}

export function buildUpdateLeverageAction(params: {
  assetIndex: number;
  leverage: number;
  isCross?: boolean;
}): Record<string, unknown> {
  return {
    type: "updateLeverage",
    asset: params.assetIndex,
    isCross: params.isCross ?? true,
    leverage: params.leverage,
  };
}

export function buildMarketOrderAction(params: {
  assetIndex: number;
  side: PerpSide;
  markPrice: number;
  sizeUnits: number;
  szDecimals: number;
  slippage?: number;
}): Record<string, unknown> {
  const limitPrice = computeSlippageLimitPrice(params.markPrice, params.side, params.slippage);
  return {
    type: "order",
    orders: [
      {
        a: params.assetIndex,
        b: params.side === "long",
        p: formatPrice(limitPrice, params.szDecimals),
        s: formatSize(params.sizeUnits, params.szDecimals),
        r: false,
        t: { limit: { tif: "FrontendMarket" } },
      },
    ],
    grouping: "na",
  };
}

/** Position size in the underlying asset for a given margin+leverage —
 * reuses the exact same math the Phase 3 preview already shows the user,
 * so what gets signed always matches what was previewed. */
export function computeOrderSizeUnits(marginUsdc: number, leverage: number, markPrice: number): number {
  return calculateEstimatedUnits(calculateNotionalValue(marginUsdc, leverage), markPrice);
}

// ---------------------------------------------------------------------------
// Wallet adapter — translates @nktkas/hyperliquid's AbstractWallet
// interface into our existing Eip1193Provider. Never touches a private
// key: signTypedData() below asks the wallet to sign, the wallet performs
// the actual cryptography and returns only the signature.
// ---------------------------------------------------------------------------

export function createHyperliquidWalletAdapter(
  provider: Eip1193Provider,
  address: string
): AbstractViemJsonRpcAccount {
  return {
    async signTypedData(params) {
      const signature = await signTypedData(
        address,
        params.domain as Record<string, unknown>,
        params.types,
        params.primaryType,
        params.message,
        provider
      );
      return signature as `0x${string}`;
    },
    async getAddresses() {
      return [address as `0x${string}`];
    },
    async getChainId() {
      return getWalletChainId(provider);
    },
  };
}

// ---------------------------------------------------------------------------
// Submission — POSTs an already-signed action to our own server, never to
// Hyperliquid directly.
// ---------------------------------------------------------------------------

async function submitSignedAction(
  address: string,
  action: Record<string, unknown>,
  nonce: number,
  signature: HyperliquidSignature
): Promise<HyperliquidExchangeResult> {
  let res: Response;
  try {
    res = await fetch("/api/hyperliquid/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, action, nonce, signature }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // Couldn't even determine whether OUR server received this, let alone
    // whether it reached Hyperliquid — never report this as a hard
    // failure, the caller must treat it as "check your positions."
    return { status: "network-failure", message: "Couldn't confirm whether this was submitted." };
  }

  if (!res.ok) {
    // A non-200 from our OWN route (401/429/400) is NOT ambiguous — it
    // means the request was rejected by auth/rate-limit/shape validation
    // BEFORE submitHyperliquidExchangeAction ever ran, so Hyperliquid was
    // definitely never contacted for this specific call.
    const body = await res.json().catch(() => null);
    return {
      status: "rejected",
      reason: "invalid-request",
      message: body?.error ?? "The request was rejected before it reached Hyperliquid.",
    };
  }

  const body = (await res.json()) as { result: HyperliquidExchangeResult };
  return body.result;
}

// ---------------------------------------------------------------------------
// Orchestration — signs (and submits) leverage, then the order. Each sign
// step pops the wallet's own approval UI; a user declining either one
// stops the flow immediately with "wallet-rejected", never proceeding to
// the next step or fabricating a result.
// ---------------------------------------------------------------------------

export type PerpOrderExecutionResult = { status: "wallet-rejected" } | HyperliquidExchangeResult;

/** The live-progress stages a caller can render while signAndSubmitPerpOrder
 * is in flight — reported via the optional onStageChange callback, since
 * the two sign+submit round trips happen inside one async function call. */
export type PerpOrderExecutionStage = "signing-leverage" | "submitting-leverage" | "signing-order" | "submitting-order";

export async function signAndSubmitPerpOrder(params: {
  provider: Eip1193Provider;
  address: string;
  assetIndex: number;
  szDecimals: number;
  side: PerpSide;
  marginUsdc: number;
  leverage: number;
  markPrice: number;
  isTestnet: boolean;
  onStageChange?: (stage: PerpOrderExecutionStage) => void;
}): Promise<PerpOrderExecutionResult> {
  const wallet = createHyperliquidWalletAdapter(params.provider, params.address);

  const leverageAction = buildUpdateLeverageAction({ assetIndex: params.assetIndex, leverage: params.leverage });
  const leverageNonce = nextNonce();

  let leverageSignature: HyperliquidSignature;
  try {
    params.onStageChange?.("signing-leverage");
    leverageSignature = await signL1Action({
      wallet,
      action: leverageAction,
      nonce: leverageNonce,
      isTestnet: params.isTestnet,
    });
  } catch (err) {
    if (isUserRejectedError(err)) return { status: "wallet-rejected" };
    return { status: "rejected", reason: "invalid-request", message: "Couldn't sign the leverage update." };
  }

  params.onStageChange?.("submitting-leverage");
  const leverageResult = await submitSignedAction(params.address, leverageAction, leverageNonce, leverageSignature);
  if (leverageResult.status === "rejected" || leverageResult.status === "hyperliquid-rejected") {
    return leverageResult; // stop here — never sign/submit the order on top of a failed leverage update
  }
  // "network-failure"/"pending"/"resting"/"filled" for a leverage action
  // all mean "proceed" — leverage has no fill/rest concept, so anything
  // that isn't an explicit rejection is treated as accepted.

  const sizeUnits = computeOrderSizeUnits(params.marginUsdc, params.leverage, params.markPrice);
  const orderAction = buildMarketOrderAction({
    assetIndex: params.assetIndex,
    side: params.side,
    markPrice: params.markPrice,
    sizeUnits,
    szDecimals: params.szDecimals,
  });
  const orderNonce = nextNonce(leverageNonce);

  let orderSignature: HyperliquidSignature;
  try {
    params.onStageChange?.("signing-order");
    orderSignature = await signL1Action({
      wallet,
      action: orderAction,
      nonce: orderNonce,
      isTestnet: params.isTestnet,
    });
  } catch (err) {
    if (isUserRejectedError(err)) return { status: "wallet-rejected" };
    return { status: "rejected", reason: "invalid-request", message: "Couldn't sign the order." };
  }

  params.onStageChange?.("submitting-order");
  return submitSignedAction(params.address, orderAction, orderNonce, orderSignature);
}
