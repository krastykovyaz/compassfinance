"use client";

// Client-side market-data hooks. UI code only ever imports these — it
// never talks to Yahoo Finance (or even knows Yahoo Finance is the
// provider) directly. Every hook here calls Compass's own /api/market/*
// routes, which are the server-side boundary in front of
// src/server/market/service.ts.
//
// There is deliberately no mock fallback anywhere in this file: if a
// fetch fails, the hook surfaces an explicit "unavailable" state and the
// UI is responsible for rendering that clearly (see market-overview.tsx /
// price-chart.tsx) rather than quietly showing a fake number.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALL_MARKET_SYMBOLS,
  MarketAssetQuote,
  MarketSymbol,
  QuoteFetchResult,
} from "./market-types";

const POLL_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

type QuoteApiResponse = { results: QuoteFetchResult[] };

async function fetchQuotes(symbols: MarketSymbol[]): Promise<QuoteFetchResult[]> {
  const res = await fetch(`/api/market/quote?symbols=${symbols.join(",")}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`/api/market/quote request failed (${res.status})`);
  }
  const json = (await res.json()) as QuoteApiResponse;
  return json.results;
}

export type UseMarketDataResult = {
  quotes: MarketAssetQuote[];
  bySlug: Partial<Record<MarketSymbol, MarketAssetQuote>>;
  /** Symbols that failed to load a real quote — never filled with fake data. */
  unavailable: Partial<Record<MarketSymbol, string>>;
  isLoading: boolean;
  /** Set only on a hard failure (e.g. network down) where we have nothing at all to show. */
  error: string | null;
  refresh: () => void;
};

export function useMarketData(
  symbols: MarketSymbol[] = ALL_MARKET_SYMBOLS,
  pollMs: number = POLL_INTERVAL_MS
): UseMarketDataResult {
  const [quotes, setQuotes] = useState<MarketAssetQuote[]>([]);
  const [unavailable, setUnavailable] = useState<Partial<Record<MarketSymbol, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const symbolsKey = symbols.join(",");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await fetchQuotes(symbols);
      const nextQuotes: MarketAssetQuote[] = [];
      const nextUnavailable: Partial<Record<MarketSymbol, string>> = {};
      for (const result of results) {
        if (result.status === "ok") {
          nextQuotes.push(result.quote);
        } else {
          nextUnavailable[result.slug] = result.reason;
        }
      }
      setQuotes(nextQuotes);
      setUnavailable(nextUnavailable);
      setError(null);
    } catch (err) {
      // The route itself never throws (see quote/route.ts) — this only
      // fires on a genuine network failure reaching our own server.
      setError(err instanceof Error ? err.message : "Couldn't load market data");
    } finally {
      setIsLoading(false);
    }
    // symbolsKey is the stable dependency; `symbols` itself may be a new
    // array identity every render if the caller doesn't memoize it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  useEffect(() => {
    // Deferred via setTimeout(0): calling load() synchronously in the effect
    // body would trip react-hooks/set-state-in-effect, since load's first
    // line sets isLoading. This fires on the next tick instead — same
    // effective timing, just not synchronous within the effect's commit.
    const kickoff = setTimeout(load, 0);
    const interval = setInterval(load, pollMs);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [load, pollMs]);

  const bySlug = useMemo(() => {
    const map: Partial<Record<MarketSymbol, MarketAssetQuote>> = {};
    for (const q of quotes) map[q.slug] = q;
    return map;
  }, [quotes]);

  return { quotes, bySlug, unavailable, isLoading, error, refresh: load };
}

/** Convenience hook for a single symbol — used by the asset detail page, trade sheet, and position page. */
export function useAssetQuote(
  slug: MarketSymbol,
  pollMs: number = POLL_INTERVAL_MS
): {
  result: QuoteFetchResult | null;
  isLoading: boolean;
  refresh: () => void;
} {
  const symbols = useMemo(() => [slug], [slug]);
  const { bySlug, unavailable, isLoading, refresh } = useMarketData(symbols, pollMs);

  const result: QuoteFetchResult | null = useMemo(() => {
    const quote = bySlug[slug];
    if (quote) return { slug, status: "ok", quote };
    const reason = unavailable[slug];
    if (reason) return { slug, status: "unavailable", reason };
    return null;
  }, [bySlug, unavailable, slug]);

  return { result, isLoading, refresh };
}
