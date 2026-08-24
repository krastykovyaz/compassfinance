"use client";

// Client hook for a Hyperliquid L2 order book. Fetches only while the
// caller keeps this mounted (e.g. a market row's expanded "book" view) —
// unlike quotes, the order book is not needed for every row on every
// poll, so this intentionally does NOT auto-fetch on mount by default;
// the caller decides when to start (see enabled) and how often to poll.

import { useCallback, useEffect, useState } from "react";
import type { HyperliquidOrderBook, HyperliquidOrderBookFetchResult } from "./hyperliquid-types";

const FETCH_TIMEOUT_MS = 10_000;

export type UseHyperliquidOrderBookResult = {
  book: HyperliquidOrderBook | null;
  status: "loading" | "ok" | "unavailable";
  reason: string | null;
  refresh: () => void;
};

export function useHyperliquidOrderBook(
  coin: string,
  options?: { enabled?: boolean; pollMs?: number }
): UseHyperliquidOrderBookResult {
  const enabled = options?.enabled ?? true;
  const pollMs = options?.pollMs;
  const [book, setBook] = useState<HyperliquidOrderBook | null>(null);
  const [status, setStatus] = useState<UseHyperliquidOrderBookResult["status"]>("loading");
  const [reason, setReason] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/hyperliquid/orderbook?coin=${coin}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`/api/hyperliquid/orderbook request failed (${res.status})`);
      }
      const json = (await res.json()) as { result: HyperliquidOrderBookFetchResult };
      if (json.result.status === "ok") {
        setBook(json.result.book);
        setStatus("ok");
        setReason(null);
      } else {
        setBook(null);
        setStatus("unavailable");
        setReason(json.result.reason);
      }
    } catch (err) {
      setBook(null);
      setStatus("unavailable");
      setReason(err instanceof Error ? err.message : "Hyperliquid order book unavailable");
    }
  }, [coin]);

  useEffect(() => {
    if (!enabled) return;
    const kickoff = setTimeout(load, 0);
    const interval = pollMs ? setInterval(load, pollMs) : undefined;
    return () => {
      clearTimeout(kickoff);
      if (interval) clearInterval(interval);
    };
  }, [load, enabled, pollMs]);

  return { book, status, reason, refresh: load };
}
