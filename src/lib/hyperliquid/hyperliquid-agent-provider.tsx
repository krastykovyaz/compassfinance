"use client";

// Client Context for the Phase 5 Agent Wallet — see hyperliquid-agent-wallet.ts
// for why this exists (MetaMask rejects real order signing on a chainId
// mismatch Hyperliquid's protocol makes unavoidable any other way).
//
// Wired at the layout level (not local to the trading page) so approving
// the agent once carries across navigating between /hyperliquid/btc and
// /hyperliquid/eth in the same session — re-approving per coin would
// defeat the point of a one-time approval.
//
// State lives ONLY in React state — no localStorage/sessionStorage, by
// design. A reload loses the agent and the user re-approves; this is the
// intended trade-off for never persisting a signing key anywhere.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  approveAgent as approveAgentAction,
  createAgentSigner,
  generateAgentKeypair,
} from "./hyperliquid-agent-wallet";
import { useWallet } from "@/lib/wallet/wallet-provider";
import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import type { Eip1193Provider } from "@/lib/wallet/wallet-types";
import type { ApproveAgentResult } from "./hyperliquid-agent-wallet";

export type HyperliquidAgentStatus = "none" | "approving" | "approved" | "error";

export type HyperliquidAgentContextValue = {
  agentStatus: HyperliquidAgentStatus;
  agentAddress: `0x${string}` | null;
  errorMessage: string | null;
  /** The agent's own local signer, ready to hand to signAndSubmitPerpOrder —
   * only non-null once agentStatus is "approved". */
  agentWallet: AbstractWallet | null;
  approve: (params: {
    provider: Eip1193Provider;
    address: string;
    isTestnet: boolean;
    /** wallet-provider.tsx's live-tracked WalletState.chainId — see
     * preferredApprovedChain's comment in hyperliquid-agent-wallet.ts. */
    walletChainId?: number | null;
  }) => Promise<AbstractWallet | null>;
  reset: () => void;
};

const HyperliquidAgentContext = createContext<HyperliquidAgentContextValue | null>(null);

function describeApprovalFailure(result: ApproveAgentResult): string {
  if (result.status === "wallet-rejected") return "You declined the approval in your wallet.";
  if ("message" in result && result.message) return result.message;
  return "Couldn't approve Hyperliquid trading — try again.";
}

export function HyperliquidAgentProvider({ children }: { children: ReactNode }) {
  const { address: connectedAddress } = useWallet();
  const [agentStatus, setAgentStatus] = useState<HyperliquidAgentStatus>("none");
  const [agentAddress, setAgentAddress] = useState<`0x${string}` | null>(null);
  const [agentWallet, setAgentWallet] = useState<AbstractWallet | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = useCallback(() => {
    setAgentStatus("none");
    setAgentAddress(null);
    setAgentWallet(null);
    setErrorMessage(null);
  }, []);

  // An approved agent is only ever authorized to trade on behalf of
  // whichever address actually signed its approveAgent action — but
  // agentStatus alone (not that address) is what the trading UI gates
  // on. Left unguarded, switching wallet accounts or disconnecting/
  // reconnecting a different wallet — without a full page reload — would
  // leave a stale agent in place: the UI would show the new address and
  // its balance, but a submitted trade would actually execute on the
  // OLD address's real Hyperliquid account, since Hyperliquid recovers
  // the true signer from the agent's own signature, not from whatever
  // address our own request happens to mention. Reset whenever the
  // connected address changes (including to/from disconnected).
  const lastAddressRef = useRef(connectedAddress);
  const addressGenerationRef = useRef(0);
  useEffect(() => {
    if (lastAddressRef.current !== connectedAddress) {
      lastAddressRef.current = connectedAddress;
      addressGenerationRef.current += 1;
      reset();
    }
  }, [connectedAddress, reset]);

  const approve = useCallback(
    async (params: { provider: Eip1193Provider; address: string; isTestnet: boolean; walletChainId?: number | null }) => {
      const generation = addressGenerationRef.current;
      setAgentStatus("approving");
      setErrorMessage(null);

      const keypair = generateAgentKeypair();
      const result = await approveAgentAction({
        provider: params.provider,
        address: params.address,
        agentAddress: keypair.address,
        isTestnet: params.isTestnet,
        walletChainId: params.walletChainId,
      });

      // The connected address changed while this approval was in flight
      // (e.g. the user switched accounts mid-signature) — its result now
      // belongs to a master account that's no longer the connected one.
      // Discard it rather than applying an approval for the wrong
      // address; the reset the address-change effect already ran stays
      // in effect.
      if (addressGenerationRef.current !== generation) return null;

      if (
        result.status === "wallet-rejected" ||
        result.status === "rejected" ||
        result.status === "hyperliquid-rejected" ||
        result.status === "network-failure"
      ) {
        setAgentStatus("error");
        setErrorMessage(describeApprovalFailure(result));
        return null;
      }

      // "pending"/"resting"/"filled" all mean Hyperliquid accepted the
      // approval — approveAgent has no fill/rest concept of its own, so
      // anything that isn't an explicit rejection means it went through.
      const signer = createAgentSigner(keypair.privateKey);
      setAgentAddress(keypair.address);
      setAgentWallet(signer);
      setAgentStatus("approved");
      // Returned (not just set into state) so a caller that wants to
      // immediately chain into a signed action — e.g. "approve, then
      // submit this close" as one user-perceived tap — doesn't have to
      // wait a render cycle for this same hook's own agentWallet to
      // reflect it; React state updates aren't visible synchronously
      // within the function that triggered them.
      return signer;
    },
    []
  );

  const value = useMemo<HyperliquidAgentContextValue>(
    () => ({ agentStatus, agentAddress, errorMessage, agentWallet, approve, reset }),
    [agentStatus, agentAddress, errorMessage, agentWallet, approve, reset]
  );

  return <HyperliquidAgentContext.Provider value={value}>{children}</HyperliquidAgentContext.Provider>;
}

export function useHyperliquidAgent(): HyperliquidAgentContextValue {
  const ctx = useContext(HyperliquidAgentContext);
  if (!ctx) throw new Error("useHyperliquidAgent must be used within a HyperliquidAgentProvider");
  return ctx;
}
