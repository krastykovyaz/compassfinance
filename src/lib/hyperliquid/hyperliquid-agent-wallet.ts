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

/** WORKAROUND for a verified bug spanning @walletconnect/ethereum-provider
 * and @walletconnect/universal-provider (installed versions at time of
 * writing: both 2.23.10). Reproduced live and confirmed by reading both
 * packages' own source, not guessed:
 *
 * - The OUTER EthereumProvider wraps a `signer` (a UniversalProvider
 *   instance) and scopes every relayed request — including the actual
 *   signing request — via ITS OWN `this.chainId`
 *   (`this.signer.request(t, this.formatChainId(this.chainId), e)`).
 * - `eth_chainId` specifically, though, is answered by a DIFFERENT,
 *   deeper object: `signer.rpcProviders.eip155` (built once per session
 *   in UniversalProvider's createProviders()), whose own `request()`
 *   directly returns `parseInt(this.getDefaultChain())` — reading ITS
 *   OWN separate `chainId` property, not the outer wrapper's.
 *
 * On a real wallet, both of these were found holding a value OUTSIDE the
 * session's own approved chain list entirely (reproduced: 270689, while
 * the session's real namespace only ever approved {1, 10, 137, 8453,
 * 42161}), even though the wallet's own UI confirmed its real active
 * chain (42161) was among the approved set the whole time. There is no
 * supported public API to fix this from outside the SDK — this directly
 * corrects both internal properties, neither of which is part of the
 * public Eip1193Provider contract, so this is narrowly scoped to exactly
 * this one desync condition and left heavily commented. Remove if a
 * future SDK release fixes this upstream. A no-op for the common case
 * (injected wallets, or a WalletConnect session whose internal state
 * already agrees with its own session). */
type WalletConnectInternals = {
  session?: { namespaces?: Record<string, { chains?: string[] }> };
  chainId?: number;
  signer?: { rpcProviders?: { eip155?: { chainId?: number } } };
};

/** The approved eip155 chains for a WalletConnect session, straight from
 * its own (immutable, negotiated-once) namespace data — never from any
 * live-tracked, event-mutable "current chain" pointer. Returns null for
 * a non-WalletConnect provider or one with no session yet. */
export function walletConnectApprovedChains(provider: Eip1193Provider): string[] | null {
  const chains = (provider as unknown as WalletConnectInternals).session?.namespaces?.eip155?.chains;
  return chains && chains.length > 0 ? chains : null;
}

/** Real, reproduced bug (2026-08-23): a user got
 * `"active chainId is different than the one provided"` straight back
 * from their wallet. Root cause — this function used to ALWAYS guess
 * (prefer Arbitrum One, else whichever chain came first in the
 * session's approved list) with no way to check that guess against the
 * wallet's REAL active chain. A session commonly approves several chains
 * at pairing time (this app requests optionalChains = every chain in
 * SUPPORTED_CHAINS); "approved at some point" is not the same as
 * "active right now", and picking the wrong one from an otherwise-valid
 * approved list produces exactly this mismatch — a DIFFERENT failure
 * mode from the earlier-fixed one below, where the approved list agreed
 * with reality and only the SDK's own internal pointer was corrupted.
 *
 * `actualChainId` is wallet-provider.tsx's live-tracked WalletState.chainId
 * — captured at connect and kept fresh via a real chainChanged
 * subscription, so using it here is NOT a fresh RPC round trip (the thing
 * proven unsafe for WalletConnect below) — just reading already-held
 * React state. When it's present AND the session actually approved it,
 * it wins outright over the guess; the guess remains the fallback for
 * the rare case this value isn't available yet. */
export function preferredApprovedChain(chains: string[], actualChainId?: number | null): number {
  if (actualChainId != null && chains.includes(`eip155:${actualChainId}`)) {
    return actualChainId;
  }
  const preferred = chains.find((c) => c === "eip155:42161") ?? chains[0];
  return Number(preferred.split(":")[1]);
}

export function correctWalletConnectChainIdIfDesynced(provider: Eip1193Provider, actualChainId?: number | null): void {
  const chains = walletConnectApprovedChains(provider);
  if (!chains) return; // not WalletConnect, or no session yet

  const corrected = preferredApprovedChain(chains, actualChainId);
  if (!Number.isFinite(corrected)) return;

  const wc = provider as unknown as WalletConnectInternals;
  if (wc.chainId === undefined || !chains.includes(`eip155:${wc.chainId}`)) {
    wc.chainId = corrected;
  }
  const inner = wc.signer?.rpcProviders?.eip155;
  if (inner && (inner.chainId === undefined || !chains.includes(`eip155:${inner.chainId}`))) {
    inner.chainId = corrected;
  }
}

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
  /** wallet-provider.tsx's live-tracked WalletState.chainId — pass this
   * whenever it's available (it should be, once connected). See
   * preferredApprovedChain's comment: this is what makes the choice a
   * real fact about the wallet instead of a guess from its approved
   * list, without doing a fresh RPC round trip. */
  walletChainId?: number | null;
}): Promise<ApproveAgentResult> {
  const wallet = createHyperliquidWalletAdapter(params.provider, params.address);

  // For WalletConnect, read the chain straight from the session's own
  // static namespace data — never via a live eth_chainId round trip.
  // That round trip was found to re-trigger the same live desync it was
  // meant to detect, undoing any earlier correction before the sign call
  // even happens. The injected-wallet path (no session) is unaffected by
  // any of this and keeps using the real live value. Either way,
  // walletChainId (when available) is preferred over the guess — see
  // preferredApprovedChain.
  const wcChains = walletConnectApprovedChains(params.provider);
  const chainId =
    params.walletChainId ??
    (wcChains ? preferredApprovedChain(wcChains) : await getChainId(params.provider));
  const nonce = nextNonce();

  const action = buildApproveAgentAction({
    agentAddress: params.agentAddress,
    agentName: "CompassFinance",
    signatureChainId: `0x${chainId.toString(16)}`,
    hyperliquidChain: params.isTestnet ? "Testnet" : "Mainnet",
    nonce,
  });

  // Run immediately before the actual signing call — not earlier, and
  // with nothing async in between — so nothing has a chance to
  // re-corrupt the SDK's own internal chainId (used to scope the relayed
  // signing request itself) between correcting it and using it.
  correctWalletConnectChainIdIfDesynced(params.provider, params.walletChainId);

  let signature: HyperliquidSignature;
  try {
    signature = await signUserSignedAction({ wallet, action, types: ApproveAgentTypes });
  } catch (err) {
    if (isUserRejectedError(err)) return { status: "wallet-rejected" };
    // TEMPORARY diagnostic (2026-08-27): the walletChainId fix (preferring
    // the wallet's live-tracked chain over the approved-list guess) did
    // NOT resolve a reproduced "active chainId is different than the one
    // provided" report even once live — meaning the chosen chainId is
    // still wrong for at least one real wallet, for a reason not yet
    // understood. Surfacing exactly what was chosen and why, so the next
    // reproduction pinpoints it instead of another guess. Remove once
    // root-caused (same pattern as the original chainId-desync
    // investigation this session already ran once, successfully).
    const diagnostic = `signatureChainId=0x${chainId.toString(16)} (${chainId}), source=${
      params.walletChainId != null ? "walletChainId param" : wcChains ? "WC approved-list guess" : "getChainId() live call"
    }, wcApprovedChains=${wcChains ? JSON.stringify(wcChains) : "none (not WalletConnect / no session)"}`;
    return {
      status: "rejected",
      reason: "invalid-request",
      message: `Couldn't sign the trading approval: ${signingErrorDetail(err)} [${diagnostic}]`,
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
