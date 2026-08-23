"use client";

// Hyperliquid Trading Phase 5 — the Agent Wallet fix for a real, confirmed
// blocker: Hyperliquid's L1 trading actions (signL1Action, used by
// hyperliquid-order-signer.ts) always sign with a FIXED EIP-712 domain
// chainId (1337) — a Hyperliquid protocol constant, not something this app
// controls. Some wallets (confirmed: MetaMask mobile) reject a
// eth_signTypedData_v4 request whose domain chainId doesn't match the
// wallet's actively-connected network, which this fixed value can never
// satisfy on any real chain.
//
// Hyperliquid's own documented fix: a one-time "approveAgent" action, which
// uses a DIFFERENT signing scheme (signUserSignedAction, not signL1Action)
// whose domain chainId is caller-supplied — set here to the wallet's real,
// current chain, so it never mismatches. That approves a freshly-generated
// "agent" keypair to sign every later trading action itself, entirely
// in-browser, with no wallet popup and no chainId check at all (a raw
// local signer never goes through eth_signTypedData_v4).
//
// THE ONE FILE THIS TRUST BOUNDARY APPLIES TO: this is the only place a
// private key is deliberately generated. It is NOT the user's wallet key —
// it's a fresh keypair this app creates, purpose-built and revocable, that
// only ever holds delegated Hyperliquid trading authority (no funds of its
// own to steal even if somehow leaked). It is generated in memory, never
// sent to CompassFinance's server (only its PUBLIC address is), and never
// persisted to disk/localStorage/sessionStorage — the caller
// (hyperliquid-agent-provider.tsx) holds it in React state only, gone on
// reload. See no-private-key-exposure.test.ts for the explicit, narrow
// carve-out this requires.

import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
import { ApproveAgentTypes } from "@nktkas/hyperliquid/api/exchange";
import { getChainId, isUserRejectedError } from "@/lib/wallet/evm-wallet-provider";
import { createHyperliquidWalletAdapter, nextNonce, signingErrorDetail } from "./hyperliquid-order-signer";
import type { Eip1193Provider } from "@/lib/wallet/wallet-types";
import type { HyperliquidExchangeResult, HyperliquidSignature } from "./hyperliquid-types";

export type AgentKeypair = { privateKey: `0x${string}`; address: `0x${string}` };

/** A fresh, random keypair — no relation to the user's own wallet key.
 * Generated with viem's own CSPRNG-backed helper (an established,
 * audited library, not hand-rolled crypto — same stance as the rest of
 * this integration's signing code). */
export function generateAgentKeypair(): AgentKeypair {
  const privateKey = generatePrivateKey();
  const { address } = privateKeyToAccount(privateKey);
  return { privateKey, address };
}

/** Builds a local, in-browser signer from an agent's own private key —
 * satisfies @nktkas/hyperliquid's AbstractWallet shape directly (viem's
 * local account already matches it), so it can be passed straight into
 * signAndSubmitPerpOrder in place of the browser-wallet adapter. */
export function createAgentSigner(privateKey: `0x${string}`): PrivateKeyAccount {
  return privateKeyToAccount(privateKey);
}

/** Pure builder — the exact approveAgent action shape, no wallet/fetch.
 * signatureChainId MUST be the wallet's own real, current chain (never a
 * fixed value) — that's the entire fix: this is the one difference
 * between this signing scheme and the mismatching one it replaces. */
export function buildApproveAgentAction(params: {
  agentAddress: `0x${string}`;
  agentName: string;
  signatureChainId: `0x${string}`;
  hyperliquidChain: "Mainnet" | "Testnet";
  nonce: number;
}): { signatureChainId: `0x${string}`; [key: string]: unknown } {
  return {
    type: "approveAgent",
    signatureChainId: params.signatureChainId,
    hyperliquidChain: params.hyperliquidChain,
    agentAddress: params.agentAddress,
    agentName: params.agentName,
    nonce: params.nonce,
  };
}

export type ApproveAgentResult = { status: "wallet-rejected" } | HyperliquidExchangeResult;

/** Signs (with the user's REAL wallet — this is the only step that ever
 * pops it for the agent flow) and submits the one-time approveAgent
 * action, through the existing generic /api/hyperliquid/order route —
 * never straight to Hyperliquid from the browser, same boundary every
 * other action in this integration keeps. */
export async function approveAgent(params: {
  provider: Eip1193Provider;
  address: string;
  agentAddress: `0x${string}`;
  isTestnet: boolean;
}): Promise<ApproveAgentResult> {
  const wallet = createHyperliquidWalletAdapter(params.provider, params.address);
  const chainId = await getChainId(params.provider);
  const nonce = nextNonce();

  const action = buildApproveAgentAction({
    agentAddress: params.agentAddress,
    agentName: "CompassFinance",
    signatureChainId: `0x${chainId.toString(16)}`,
    hyperliquidChain: params.isTestnet ? "Testnet" : "Mainnet",
    nonce,
  });

  let signature: HyperliquidSignature;
  try {
    signature = await signUserSignedAction({ wallet, action, types: ApproveAgentTypes });
  } catch (err) {
    if (isUserRejectedError(err)) return { status: "wallet-rejected" };
    // Temporary extra detail to diagnose a live chainId-mismatch report
    // where the numbers shown didn't add up to a real hex conversion —
    // remove once resolved. Dumps whatever WalletConnect actually
    // negotiated (if this is a WalletConnect session at all) alongside
    // the derived eth_chainId, so the next failure shows the real
    // session data instead of just the number we computed from it.
    const wcSession = (params.provider as { session?: { namespaces?: Record<string, { chains?: string[] }> } })
      .session;
    return {
      status: "rejected",
      reason: "invalid-request",
      message: `Couldn't sign the trading approval: ${signingErrorDetail(err)} [sent=${action.signatureChainId}, eth_chainId=${chainId}, isWC=${!!wcSession}, wcChains=${JSON.stringify(wcSession?.namespaces?.eip155?.chains)}]`,
    };
  }

  const res = await fetch("/api/hyperliquid/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: params.address, action, nonce, signature }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!res) {
    return { status: "network-failure", message: "Couldn't confirm whether the approval was submitted." };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return {
      status: "rejected",
      reason: "invalid-request",
      message: body?.error ?? "The approval request was rejected before it reached Hyperliquid.",
    };
  }

  const body = (await res.json()) as { result: HyperliquidExchangeResult };
  return body.result;
}
