"use client";

// Single, shared source of truth for the paper-trading account (Milestone
// 16). Every screen that needs cash balance, positions, or trade history
// reads from this one context — nobody keeps their own copy. A trade
// placed from ANY screen updates this context, so Home/Portfolio/
// Position/Markets all see the result immediately without a page reload.
//
// Same pattern as favorites-provider.tsx: fetch once, expose refresh()
// for callers to invalidate after a mutation, poll lightly so unrealized
// P&L drifts with live prices even without an explicit trade.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AssetId } from "@/lib/assets/catalog";
import { PaperAccountView, PerformancePoint, PerformanceRange, PlaceTradeResult, TradeSide } from "./types";

const POLL_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

export type PaperAccountContextValue = {
  account: PaperAccountView | null;
  isLoading: boolean;
  error: string | null;
  isSignedIn: boolean;
  refresh: () => Promise<void>;
  placeTrade: (assetId: AssetId, side: TradeSide, quantity: number) => Promise<PlaceTradeResult>;
};

const PaperAccountContext = createContext<PaperAccountContextValue | null>(null);

export function PaperAccountProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [account, setAccount] = useState<PaperAccountView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (status !== "authenticated") {
      setAccount(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/user/paper-account", {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`/api/user/paper-account failed (${res.status})`);
      const json = (await res.json()) as { account: PaperAccountView };
      setAccount(json.account);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your paper account");
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const kickoff = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [refresh]);

  const placeTrade = useCallback(
    async (assetId: AssetId, side: TradeSide, quantity: number): Promise<PlaceTradeResult> => {
      if (status !== "authenticated") {
        // Same rule as favorites: don't silently no-op a tap that needs
        // an account, send the person to sign in.
        router.push("/signin");
        return { status: "error", reason: "Sign in required" };
      }
      try {
        const res = await fetch("/api/user/paper-account/trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId, side, quantity }),
        });
        const json = (await res.json()) as { account?: PaperAccountView; error?: string };
        if (!res.ok || !json.account) {
          return { status: "error", reason: json.error ?? "Trade failed" };
        }
        setAccount(json.account);
        return { status: "ok", account: json.account };
      } catch (err) {
        return { status: "error", reason: err instanceof Error ? err.message : "Trade failed" };
      }
    },
    [status, router]
  );

  const value = useMemo<PaperAccountContextValue>(
    () => ({
      account,
      isLoading,
      error,
      isSignedIn: status === "authenticated",
      refresh,
      placeTrade,
    }),
    [account, isLoading, error, status, refresh, placeTrade]
  );

  return <PaperAccountContext.Provider value={value}>{children}</PaperAccountContext.Provider>;
}

export function usePaperAccount(): PaperAccountContextValue {
  const ctx = useContext(PaperAccountContext);
  if (!ctx) {
    throw new Error("usePaperAccount must be used within a PaperAccountProvider");
  }
  return ctx;
}

/** Convenience: the user's current position in one asset, or null if they don't hold it. */
export function usePosition(assetId: AssetId) {
  const { account } = usePaperAccount();
  return account?.positions.find((p) => p.assetId === assetId) ?? null;
}

/**
 * Real portfolio-value history for the given range (Milestone 17) — the
 * one hook Home and Portfolio both use for their performance charts, so
 * there's exactly one client-side implementation of "fetch performance
 * history" rather than two copies.
 */
export function usePerformanceHistory(range: PerformanceRange): {
  points: PerformancePoint[];
  isLoading: boolean;
  error: string | null;
} {
  const { status } = useSession();
  const [points, setPoints] = useState<PerformancePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      if (status !== "authenticated") {
        setPoints([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(`/api/user/paper-account/performance?range=${range}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`/api/user/paper-account/performance failed (${res.status})`);
        const json = (await res.json()) as { points: PerformancePoint[] };
        if (cancelledRef.current) return;
        setPoints(json.points);
        setError(null);
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : "Couldn't load performance history");
      } finally {
        if (!cancelledRef.current) setIsLoading(false);
      }
    },
    [status, range]
  );

  useEffect(() => {
    const cancelledRef = { current: false };
    // Deferred via setTimeout(0) — same reasoning as market-provider.ts's
    // useMarketData: calling load() synchronously here would set loading
    // state directly in the effect body, which trips
    // react-hooks/set-state-in-effect. This fires on the next tick
    // instead, same effective timing.
    const kickoff = setTimeout(() => load(cancelledRef), 0);
    return () => {
      cancelledRef.current = true;
      clearTimeout(kickoff);
    };
  }, [load]);

  return { points, isLoading, error };
}
