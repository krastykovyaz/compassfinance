// The single server-side market-data adapter for Compass. Everything that
// needs a real price or a real chart series goes through getQuote()/
// getCandles() here — nothing else in the codebase should import
// yahoo-client.ts directly. This is the boundary requirement: React
// components never call Yahoo Finance, they call our own /api/market/*
// routes, which call this file.
//
// Both functions return a discriminated "ok" | "unavailable" result and
// NEVER fabricate a substitute value — if Yahoo Finance can't answer, the
// caller gets a clear reason string, not a fake price. There is no mock
// fallback here on purpose (see the old mock-market-provider.ts, now
// removed): a wrong-looking "unavailable" state is safer for a learning
// app than a right-looking fake number.

import { getInstrument, isMarketInstrumentSlug, MarketInstrumentSlug } from "./instruments";
import { ChartRange, isChartRange, mapRangeToYahooParams } from "./range-mapping";
import { fetchYahooCandles, fetchYahooQuote } from "./yahoo-client";
import { getOrFetch } from "./cache";

export type { ChartRange };

export type MarketAssetQuote = {
  slug: MarketInstrumentSlug;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
};

export type CandlePoint = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

export type QuoteResult =
  | { slug: string; status: "ok"; quote: MarketAssetQuote }
  | { slug: string; status: "unavailable"; reason: string };

export type CandlesResult =
  | { slug: string; range: ChartRange; status: "ok"; candles: CandlePoint[] }
  | { slug: string; range: ChartRange; status: "unavailable"; reason: string };

const QUOTE_CACHE_TTL_MS = 15_000;

export async function getQuote(slug: string): Promise<QuoteResult> {
  if (!isMarketInstrumentSlug(slug)) {
    return { slug, status: "unavailable", reason: `Unsupported instrument: ${slug}` };
  }

  const instrument = getInstrument(slug);

  try {
    const result = await getOrFetch(`quote:${slug}`, QUOTE_CACHE_TTL_MS, async () => {
      const fetched = await fetchYahooQuote(instrument.yahooTicker);
      if (!fetched.ok) {
        // Thrown so getOrFetch does NOT cache the failure — see cache.ts's
        // "does not cache rejections" note. A transient Yahoo hiccup
        // shouldn't pin every user to "unavailable" for the full TTL.
        throw new Error(fetched.message);
      }
      return fetched.data;
    });

    const change = result.price - result.previousClose;
    const changePercent = result.previousClose !== 0 ? (change / result.previousClose) * 100 : 0;

    const quote: MarketAssetQuote = {
      slug: instrument.slug,
      symbol: instrument.displaySymbol,
      name: instrument.displayName,
      price: result.price,
      change,
      changePercent,
      timestamp: Date.now(),
    };
    return { slug, status: "ok", quote };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Market data unavailable";
    return { slug, status: "unavailable", reason };
  }
}

export async function getQuotes(slugs: string[]): Promise<QuoteResult[]> {
  return Promise.all(slugs.map(getQuote));
}

export async function getCandles(slug: string, range: string): Promise<CandlesResult> {
  if (!isChartRange(range)) {
    return { slug, range: "1D", status: "unavailable", reason: `Unsupported range: ${range}` };
  }
  if (!isMarketInstrumentSlug(slug)) {
    return { slug, range, status: "unavailable", reason: `Unsupported instrument: ${slug}` };
  }

  const instrument = getInstrument(slug);
  const params = mapRangeToYahooParams(range);

  try {
    const candles = await getOrFetch(`candles:${slug}:${range}`, params.cacheTtlMs, async () => {
      const fetched = await fetchYahooCandles(instrument.yahooTicker, {
        range: params.range,
        interval: params.interval,
      });
      if (!fetched.ok) {
        throw new Error(fetched.message);
      }
      return fetched.data;
    });

    return { slug, range, status: "ok", candles };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Market data unavailable";
    return { slug, range, status: "unavailable", reason };
  }
}
