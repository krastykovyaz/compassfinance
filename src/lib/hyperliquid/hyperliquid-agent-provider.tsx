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

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import {
  approveAgent as approveAgentAction,
  createAgentSigner,
  generateAgentKeypair,
} from "./hyperliquid-agent-wallet";
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
  approve: (params: { provider: Eip1193Provider; address: string; isTestnet: boolean }) => Promise<void>;
  reset: () => void;
};

const HyperliquidAgentContext = createContext<HyperliquidAgentContextValue | null>(null);

function describeApprovalFailure(result: ApproveAgentResult): string {
  if (result.status === "wallet-rejected") return "You declined the approval in your wallet.";
  if ("message" in result && result.message) return result.message;
  return "Couldn't approve Hyperliquid trading — try again.";
}

export function HyperliquidAgentProvider({ children }: { children: ReactNode }) {
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

  const approve = useCallback(
    async (params: { provider: Eip1193Provider; address: string; isTestnet: boolean }) => {
      setAgentStatus("approving");
      setErrorMessage(null);

      const keypair = generateAgentKeypair();
      const result = await approveAgentAction({
        provider: params.provider,
        address: params.address,
        agentAddress: keypair.address,
        isTestnet: params.isTestnet,
      });

      if (
        result.status === "wallet-rejected" ||
        result.status === "rejected" ||
        result.status === "hyperliquid-rejected" ||
        result.status === "network-failure"
      ) {
        setAgentStatus("error");
        setErrorMessage(describeApprovalFailure(result));
        return;
      }

      // "pending"/"resting"/"filled" all mean Hyperliquid accepted the
      // approval — approveAgent has no fill/rest concept of its own, so
      // anything that isn't an explicit rejection means it went through.
      setAgentAddress(keypair.address);
      setAgentWallet(createAgentSigner(keypair.privateKey));
      setAgentStatus("approved");
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
