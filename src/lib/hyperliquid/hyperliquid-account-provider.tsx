"use client";

// Client Context for the connected wallet's real Hyperliquid account data
// (balance, positions, open orders, recent fills). Structurally mirrors
// src/lib/trading/paper-account-provider.tsx (own Context, setInterval
// poll, AbortSignal.timeout) but is sourced from the wallet layer instead
// of an independent trigger — this is an entirely separate file/Context
// with zero import to/from Paper Trading's provider, matching the
// required Learning→Unlock→Paper-Trading vs. Hyperliquid→Live-Account
// isolation.
//
// When the wallet isn't connected (or the user isn't signed in), refresh()
// never calls fetch at all — this is what structurally guarantees no fake
// balances/positions are ever shown while disconnected, rather than just
// relying on the UI to hide a fetched-but-irrelevant value.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "@/lib/wallet/wallet-provider";
import type {
  HyperliquidAccountFetchResult,
  HyperliquidAccountSnapshot,
  HyperliquidFill,
  HyperliquidFillsFetchResult,
  HyperliquidOpenOrder,
  HyperliquidOpenOrdersFetchResult,
} from "./hyperliquid-types";

const POLL_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

export type HyperliquidAccountStatus = "disconnected" | "loading" | "unavailable" | "empty" | "ok" | "error";

export type HyperliquidAccountContextValue = {
  snapshot: HyperliquidAccountSnapshot | null;
  openOrders: HyperliquidOpenOrder[];
  fills: HyperliquidFill[];
  status: HyperliquidAccountStatus;
  errorMessage: string | null;
  refresh: () => Promise<void>;
};

type AccountApiResponse = {
  account: HyperliquidAccountFetchResult;
  openOrders: HyperliquidOpenOrdersFetchResult;
  fills: HyperliquidFillsFetchResult;
};

const HyperliquidAccountContext = createContext<HyperliquidAccountContextValue | null>(null);

export function HyperliquidAccountProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus } = useSession();
  const { isConnected, address } = useWallet();
  const [snapshot, setSnapshot] = useState<HyperliquidAccountSnapshot | null>(null);
  const [openOrders, setOpenOrders] = useState<HyperliquidOpenOrder[]>([]);
  const [fills, setFills] = useState<HyperliquidFill[]>([]);
  const [status, setStatus] = useState<HyperliquidAccountStatus>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (sessionStatus !== "authenticated" || !isConnected || !address) {
      setSnapshot(null);
      setOpenOrders([]);
      setFills([]);
      setStatus("disconnected");
      setErrorMessage(null);
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch(`/api/hyperliquid/account?address=${address}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`/api/hyperliquid/account request failed (${res.status})`);
      }
      const json = (await res.json()) as AccountApiResponse;

      if (json.account.status !== "ok") {
        setSnapshot(null);
        setOpenOrders([]);
        setFills([]);
        setStatus("unavailable");
        setErrorMessage(json.account.reason);
        return;
      }

      const orders = json.openOrders.status === "ok" ? json.openOrders.orders : [];
      const fillsList = json.fills.status === "ok" ? json.fills.fills : [];

      setSnapshot(json.account.account);
      setOpenOrders(orders);
      setFills(fillsList);
      setErrorMessage(null);
      setStatus(json.account.account.positions.length === 0 && orders.length === 0 && fillsList.length === 0 ? "empty" : "ok");
    } catch (err) {
      setSnapshot(null);
      setOpenOrders([]);
      setFills([]);
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Couldn't load your Hyperliquid account");
    }
  }, [sessionStatus, isConnected, address]);

  useEffect(() => {
    const kickoff = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [refresh]);

  const value = useMemo<HyperliquidAccountContextValue>(
    () => ({ snapshot, openOrders, fills, status, errorMessage, refresh }),
    [snapshot, openOrders, fills, status, errorMessage, refresh]
  );

  return <HyperliquidAccountContext.Provider value={value}>{children}</HyperliquidAccountContext.Provider>;
}

export function useHyperliquidAccount(): HyperliquidAccountContextValue {
  const ctx = useContext(HyperliquidAccountContext);
  if (!ctx) throw new Error("useHyperliquidAccount must be used within a HyperliquidAccountProvider");
  return ctx;
}

// Phase 8 — a HIP-3 dex (e.g. "xyz") holds its OWN isolated margin pool,
// separate from the main dex's balance the Context above tracks (verified
// live: the same address holds a genuinely different accountValue with
// dex:"xyz" than without it). Deliberately NOT folded into
// HyperliquidAccountProvider's single global Context — this is only
// relevant on the trading page and the Portfolio panel for the handful of
// HIP-3-mapped assets, not something every screen needs to poll for. Same
// "never fetch while disconnected" guarantee as the main account: dex
// being null (asset isn't HIP-3-mapped, or not yet resolved) also skips
// fetching entirely, same as being signed out.
export type HyperliquidDexAccountContextValue = Omit<HyperliquidAccountContextValue, "openOrders" | "fills"> & {
  openOrders: HyperliquidOpenOrder[];
};

export function useHyperliquidDexAccount(dex: string | null): HyperliquidDexAccountContextValue {
  const { status: sessionStatus } = useSession();
  const { isConnected, address } = useWallet();
  const [snapshot, setSnapshot] = useState<HyperliquidAccountSnapshot | null>(null);
  const [openOrders, setOpenOrders] = useState<HyperliquidOpenOrder[]>([]);
  const [status, setStatus] = useState<HyperliquidAccountStatus>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (sessionStatus !== "authenticated" || !isConnected || !address || !dex) {
      setSnapshot(null);
      setOpenOrders([]);
      setStatus("disconnected");
      setErrorMessage(null);
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch(`/api/hyperliquid/account?address=${address}&dex=${dex}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`/api/hyperliquid/account request failed (${res.status})`);
      }
      const json = (await res.json()) as { account: HyperliquidAccountFetchResult; openOrders: HyperliquidOpenOrdersFetchResult };

      if (json.account.status !== "ok") {
        setSnapshot(null);
        setOpenOrders([]);
        setStatus("unavailable");
        setErrorMessage(json.account.reason);
        return;
      }

      const orders = json.openOrders.status === "ok" ? json.openOrders.orders : [];
      setSnapshot(json.account.account);
      setOpenOrders(orders);
      setErrorMessage(null);
      setStatus(json.account.account.positions.length === 0 && orders.length === 0 ? "empty" : "ok");
    } catch (err) {
      setSnapshot(null);
      setOpenOrders([]);
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Couldn't load your XYZ trading balance");
    }
  }, [sessionStatus, isConnected, address, dex]);

  useEffect(() => {
    const kickoff = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [refresh]);

  return { snapshot, openOrders, status, errorMessage, refresh };
}
