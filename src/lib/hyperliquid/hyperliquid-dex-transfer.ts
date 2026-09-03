"use client";

// Phase 8 — the collateral transfer that moves USDC between the main
// Hyperliquid dex and a HIP-3 dex's own ISOLATED margin pool (verified
// live: the same address holds a genuinely different balance per dex —
// see asset-mapping.ts's header comment). Reuses the EXACT same signing
// infrastructure as everything else in this integration: sendAsset is a
// User-Signed EIP-712 action, same scheme as Phase 5's approveAgent (see
// hyperliquid-agent-wallet.ts), signed by the real connected wallet
// (never the agent — this moves real collateral, not a trading
// delegation) and relayed through the existing generic
// /api/hyperliquid/order route. No new signing system, no new route.

import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
import { SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import { getChainId, isUserRejectedError } from "@/lib/wallet/evm-wallet-provider";
import {
  createHyperliquidWalletAdapter,
  nextNonce,
  signingErrorDetail,
} from "./hyperliquid-order-signer";
import {
  correctWalletConnectChainIdIfDesynced,
  walletConnectApprovedChains,
  preferredApprovedChain,
  switchToChain,
} from "./hyperliquid-agent-wallet";
import type { Eip1193Provider } from "@/lib/wallet/wallet-types";
import type { HyperliquidExchangeResult, HyperliquidSignature } from "./hyperliquid-types";

export type DexTransferDirection = "fund" | "withdraw";

/** "fund" moves the main dex's own USDC INTO a HIP-3 dex's isolated pool;
 * "withdraw" moves it back. Never any other source/destination pair — the
 * server independently re-validates this same restriction (see
 * submitHyperliquidExchangeAction), so a client bug here can't move funds
 * anywhere else even before the wallet's own signature is considered. */
function dexPairForDirection(direction: DexTransferDirection, dex: string): { sourceDex: string; destinationDex: string } {
  return direction === "fund" ? { sourceDex: "", destinationDex: dex } : { sourceDex: dex, destinationDex: "" };
}

/** Pure builder — the exact sendAsset action shape, no wallet/fetch.
 * `token` MUST be the real, live-resolved "USDC:0x..." id for the
 * current network (see /api/hyperliquid/markets' usdcTokenId) — never
 * hardcoded, since it differs between mainnet and testnet. */
export function buildSendAssetAction(params: {
  address: `0x${string}`;
  direction: DexTransferDirection;
  dex: string;
  amountUsdc: string;
  usdcTokenId: string;
  signatureChainId: `0x${string}`;
  hyperliquidChain: "Mainnet" | "Testnet";
  nonce: number;
}): { signatureChainId: `0x${string}`; [key: string]: unknown } {
  const { sourceDex, destinationDex } = dexPairForDirection(params.direction, params.dex);
  return {
    type: "sendAsset",
    signatureChainId: params.signatureChainId,
    hyperliquidChain: params.hyperliquidChain,
    destination: params.address,
    sourceDex,
    destinationDex,
    token: params.usdcTokenId,
    amount: params.amountUsdc,
    fromSubAccount: "",
    nonce: params.nonce,
  };
}

export type DexTransferResult = { status: "wallet-rejected" } | HyperliquidExchangeResult;

/** Signs (with the user's REAL wallet — never the agent) and submits a
 * sendAsset transfer, through the existing generic /api/hyperliquid/order
 * route — same boundary every other action in this integration keeps:
 * the browser never talks to Hyperliquid directly. */
export async function signAndSubmitDexTransfer(params: {
  provider: Eip1193Provider;
  address: `0x${string}`;
  direction: DexTransferDirection;
  dex: string;
  amountUsdc: string;
  usdcTokenId: string;
  isTestnet: boolean;
  /** wallet-provider.tsx's live-tracked WalletState.chainId — see
   * preferredApprovedChain's comment in hyperliquid-agent-wallet.ts for
   * why this is preferred over guessing from the approved chain list. */
  walletChainId?: number | null;
}): Promise<DexTransferResult> {
  const wallet = createHyperliquidWalletAdapter(params.provider, params.address);

  // Same WalletConnect chainId-desync handling every other real-wallet
  // signature in this integration needs — see hyperliquid-agent-wallet.ts
  // for the full reasoning (switchToChain, the live-retry self-heal, and
  // why correctWalletConnectChainIdIfDesynced alone isn't enough).
  const wcChains = walletConnectApprovedChains(params.provider);
  let chainId =
    params.walletChainId ??
    (wcChains ? preferredApprovedChain(wcChains) : await getChainId(params.provider));

  await switchToChain(params.provider, chainId);

  async function attemptSign() {
    const nonce = nextNonce();
    const action = buildSendAssetAction({
      address: params.address,
      direction: params.direction,
      dex: params.dex,
      amountUsdc: params.amountUsdc,
      usdcTokenId: params.usdcTokenId,
      signatureChainId: `0x${chainId.toString(16)}`,
      hyperliquidChain: params.isTestnet ? "Testnet" : "Mainnet",
      nonce,
    });
    correctWalletConnectChainIdIfDesynced(params.provider, chainId);
    const signature = await signUserSignedAction({ wallet, action, types: SendAssetTypes });
    return { action, nonce, signature };
  }

  let action: ReturnType<typeof buildSendAssetAction>;
  let nonce: number;
  let signature: HyperliquidSignature;
  try {
    ({ action, nonce, signature } = await attemptSign());
  } catch (firstErr) {
    if (isUserRejectedError(firstErr)) return { status: "wallet-rejected" };

    const mismatch = signingErrorDetail(firstErr).toLowerCase().includes("active chainid is different");
    const usedLiveCall = params.walletChainId == null && !wcChains;
    if (!mismatch || usedLiveCall) {
      return {
        status: "rejected",
        reason: "invalid-request",
        message: `Couldn't sign the transfer: ${signingErrorDetail(firstErr)}`,
      };
    }

    const freshChainId = await getChainId(params.provider);
    if (freshChainId === chainId) {
      return {
        status: "rejected",
        reason: "invalid-request",
        message: `Couldn't sign the transfer: ${signingErrorDetail(firstErr)}`,
      };
    }
    chainId = freshChainId;

    try {
      ({ action, nonce, signature } = await attemptSign());
    } catch (retryErr) {
      if (isUserRejectedError(retryErr)) return { status: "wallet-rejected" };
      return {
        status: "rejected",
        reason: "invalid-request",
        message: `Couldn't sign the transfer: ${signingErrorDetail(retryErr)}`,
      };
    }
  }

  const res = await fetch("/api/hyperliquid/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: params.address, action, nonce, signature }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!res) {
    return { status: "network-failure", message: "Couldn't confirm whether the transfer was submitted." };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return {
      status: "rejected",
      reason: "invalid-request",
      message: body?.error ?? "The transfer request was rejected before it reached Hyperliquid.",
    };
  }

  const body = (await res.json()) as { result: HyperliquidExchangeResult };
  return body.result;
}
