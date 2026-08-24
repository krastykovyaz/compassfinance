"use client";

// Client hook for a Hyperliquid candle series. Calls Compass's own
// /api/hyperliquid/candles route (never Hyperliquid directly). Mirrors
// use-asset-candles.ts's shape exactly (fetch on mount/param-change,
// manual refresh, no auto-poll), with one addition: when `coin` is null
// (the asset has no Hyperliquid market — see asset-mapping.ts), this is a
// deliberate no-op that never calls fetch at all, surfaced as a distinct
// "inactive" status so a composing hook can tell "not applicable" apart
// from "tried and failed."

import { useCallback, useEffect, useState } from "react";
import type { ChartRange } from "@/lib/market/market-types";
import type { HyperliquidCandlePoint, HyperliquidCandlesFetchResult } from "./hyperliquid-types";

const FETCH_TIMEOUT_MS = 10_000;

export type UseHyperliquidCandlesResult = {
  candles: HyperliquidCandlePoint[];
  status: "inactive" | "loading" | "ok" | "unavailable";
  reason: string | null;
  refresh: () => void;
};

export function useHyperliquidCandles(coin: string | null, range: ChartRange): UseHyperliquidCandlesResult {
  const [candles, setCandles] = useState<HyperliquidCandlePoint[]>([]);
  const [status, setStatus] = useState<UseHyperliquidCandlesResult["status"]>(coin ? "loading" : "inactive");
  const [reason, setReason] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coin) {
      setCandles([]);
      setStatus("inactive");
      setReason(null);
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch(`/api/hyperliquid/candles?coin=${coin}&range=${range}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`/api/hyperliquid/candles request failed (${res.status})`);
      }
      const json = (await res.json()) as { result: HyperliquidCandlesFetchResult };
      if (json.result.status === "ok") {
        setCandles(json.result.candles);
        setStatus("ok");
        setReason(null);
      } else {
        setCandles([]);
        setStatus("unavailable");
        setReason(json.result.reason);
      }
    } catch (err) {
      setCandles([]);
      setStatus("unavailable");
      setReason(err instanceof Error ? err.message : "Hyperliquid candle data unavailable");
    }
  }, [coin, range]);

  useEffect(() => {
    const kickoff = setTimeout(load, 0);
    return () => clearTimeout(kickoff);
  }, [load]);

  return { candles, status, reason, refresh: load };
}
