"use client";

// Client-side Hyperliquid hook. UI code only ever imports this — it never
// talks to Hyperliquid directly. Calls Compass's own /api/hyperliquid/*
// routes, the server-side boundary in front of
// src/server/hyperliquid/service.ts. Mirrors market-provider.ts's
// useMarketData exactly (same setInterval-based polling, same
// no-mock-fallback stance): if a fetch fails or Hyperliquid is disabled,
// this surfaces an explicit unavailable/disabled state, never fake prices.

import { useCallback, useEffect, useState } from "react";
import type { HyperliquidMarketSnapshot, HyperliquidMarketsFetchResult } from "./hyperliquid-types";

const POLL_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

type MarketsApiResponse = { enabled: boolean; result: HyperliquidMarketsFetchResult };

export type UseHyperliquidMarketsResult = {
  markets: HyperliquidMarketSnapshot[];
  /** Whether HYPERLIQUID_ENABLED is on server-side — the UI section this
   * backs should render nothing at all when this is false. */
  enabled: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useHyperliquidMarkets(pollMs: number = POLL_INTERVAL_MS): UseHyperliquidMarketsResult {
  const [markets, setMarkets] = useState<HyperliquidMarketSnapshot[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/hyperliquid/markets", {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`/api/hyperliquid/markets request failed (${res.status})`);
      }
      const json = (await res.json()) as MarketsApiResponse;
      setEnabled(json.enabled);
      if (json.result.status === "ok") {
        setMarkets(json.result.markets);
        setError(null);
      } else {
        setMarkets([]);
        // "disabled" isn't an error condition — the feature is simply off.
        setError(json.result.reason === "disabled" ? null : json.result.reason);
      }
    } catch (err) {
      setMarkets([]);
      setError(err instanceof Error ? err.message : "Couldn't load Hyperliquid market data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(load, 0);
    const interval = setInterval(load, pollMs);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [load, pollMs]);

  return { markets, enabled, isLoading, error, refresh: load };
}
