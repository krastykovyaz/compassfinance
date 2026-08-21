"use client";

// Client hook backing the asset price chart. Calls Compass's own
// /api/market/candles route (never Yahoo Finance directly — see
// market-provider.ts's header for the same rule). No mock fallback: a
// failed/unavailable fetch is surfaced as-is so the chart can show a
// clear "Market data unavailable" state instead of a fake series.

import { useCallback, useEffect, useState } from "react";
import { CandlePoint, ChartRange, CandlesFetchResult, MarketSymbol } from "./market-types";

const FETCH_TIMEOUT_MS = 10_000;

export type UseAssetCandlesResult = {
  candles: CandlePoint[];
  status: "loading" | "ok" | "unavailable";
  reason: string | null;
  refresh: () => void;
};

export function useAssetCandles(slug: MarketSymbol, range: ChartRange): UseAssetCandlesResult {
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "unavailable">("loading");
  const [reason, setReason] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/market/candles?symbol=${slug}&range=${range}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`/api/market/candles request failed (${res.status})`);
      }
      const json = (await res.json()) as { result: CandlesFetchResult };
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
      setReason(err instanceof Error ? err.message : "Market data unavailable");
    }
  }, [slug, range]);

  useEffect(() => {
    const kickoff = setTimeout(load, 0);
    return () => clearTimeout(kickoff);
  }, [load]);

  return { candles, status, reason, refresh: load };
}
