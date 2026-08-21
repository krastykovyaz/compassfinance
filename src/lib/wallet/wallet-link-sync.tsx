"use client";

// Invisible component — no UI, just a side effect layered on top of the
// existing wallet connection. When an authenticated user has a live
// wallet connection, persists that association via /api/user/wallet so
// it's recorded in the existing WalletIdentity table. Deliberately kept
// separate from wallet-provider.tsx (which stays free of any
// auth/network concerns) and from evm-wallet-provider.tsx (real
// EIP-1193 calls only) — this is the ONE place the two get connected to
// persistence, not a second wallet state.
//
// Disconnecting does NOT delete the persisted association — it's just an
// address+chain mapping, no secret, and re-connecting later is a no-op
// upsert. See wallet-repository.ts for the exact upsert semantics.

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "./wallet-provider";

export type WalletLinkPayload = { address: string; chain: string };

/**
 * Pure "should we sync right now, and with what payload" decision — pulled
 * out of the effect below so the wallet↔Hyperliquid sync trigger logic is
 * directly testable without rendering anything. Returns null whenever
 * there's nothing to persist yet (signed out, disconnected, or no chain
 * info available at all).
 */
export function getWalletLinkPayload(params: {
  sessionStatus: string;
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  chainName: string | null;
}): WalletLinkPayload | null {
  const { sessionStatus, isConnected, address, chainId, chainName } = params;
  if (sessionStatus !== "authenticated" || !isConnected || !address) return null;

  const chain = chainName ?? (chainId !== null ? String(chainId) : null);
  if (!chain) return null;

  return { address, chain };
}

export function WalletLinkSync(): null {
  const { status } = useSession();
  const { isConnected, address, chainId, chainName } = useWallet();
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    const payload = getWalletLinkPayload({ sessionStatus: status, isConnected, address, chainId, chainName });
    if (!payload) return;

    const key = `${payload.address}:${payload.chain}`;
    if (lastSyncedRef.current === key) return;
    lastSyncedRef.current = key;

    fetch("/api/user/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Best-effort background sync — a failure here must never affect
      // the wallet UI/state itself. Allow a retry on the next relevant
      // state change by clearing the dedupe key.
      lastSyncedRef.current = null;
    });
  }, [status, isConnected, address, chainId, chainName]);

  return null;
}
