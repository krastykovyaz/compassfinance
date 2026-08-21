// Thin, server-only client around Yahoo Finance's public (unofficial, no
// API key) chart endpoint. This file's only job is to fetch a ticker and
// return either a normalized result or a clearly-classified failure reason
// — it never invents data and never falls back to anything. Everything
// above this file (market-service.ts) decides caching/what to do with a
// failure; this file just talks to Yahoo.
//
// Previously this same request was made directly from the browser (see
// git history / the old live-market-provider.ts) since Yahoo doesn't
// require a key. Moving it here keeps it server-side per the current
// requirements (no credentials to leak either way, but centralizing the
// call is what makes caching, rate protection, and consistent error
// handling possible — see cache.ts).

const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const REQUEST_TIMEOUT_MS = 10_000;

export type YahooFailureReason =
  | "network_error"
  | "http_error"
  | "not_found"
  | "malformed_response";

export type YahooFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: YahooFailureReason; message: string };

type RawYahooChartResponse = {
  chart?: {
    result?: RawYahooChartResult[] | null;
    error?: { code?: string; description?: string } | null;
  };
};

type RawYahooChartResult = {
  meta?: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: {
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }[];
  };
};

export type YahooQuoteData = {
  price: number;
  previousClose: number;
};

export type YahooCandle = {
  /** ms epoch */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

async function fetchYahooChart(
  ticker: string,
  params: { range: string; interval: string }
): Promise<YahooFetchResult<RawYahooChartResult>> {
  const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(ticker)}?range=${encodeURIComponent(
    params.range
  )}&interval=${encodeURIComponent(params.interval)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[yahoo-client] network error fetching ${ticker}: ${reason}`);
    return { ok: false, reason: "network_error", message: "Network error reaching Yahoo Finance" };
  }

  if (!res.ok) {
    console.error(`[yahoo-client] HTTP ${res.status} fetching ${ticker}`);
    return {
      ok: false,
      reason: res.status === 404 ? "not_found" : "http_error",
      message: `Yahoo Finance request failed (${res.status})`,
    };
  }

  let json: RawYahooChartResponse;
  try {
    json = (await res.json()) as RawYahooChartResponse;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[yahoo-client] non-JSON response for ${ticker}: ${reason}`);
    return { ok: false, reason: "malformed_response", message: "Yahoo Finance returned an unreadable response" };
  }

  if (json.chart?.error) {
    // Yahoo's own way of saying "no such symbol" — e.g. { code: "Not Found", description: "No data found, symbol may be delisted" }
    console.error(`[yahoo-client] Yahoo error for ${ticker}: ${JSON.stringify(json.chart.error)}`);
    return { ok: false, reason: "not_found", message: json.chart.error.description ?? "Symbol not found" };
  }

  const result = json.chart?.result?.[0];
  if (!result || typeof result !== "object") {
    return { ok: false, reason: "malformed_response", message: "Yahoo Finance response had no chart result" };
  }

  return { ok: true, data: result };
}

/** Fetches just the current price / previous close for a ticker (uses a 1d/1d request — cheapest payload that still carries `meta`). */
export async function fetchYahooQuote(ticker: string): Promise<YahooFetchResult<YahooQuoteData>> {
  const result = await fetchYahooChart(ticker, { range: "1d", interval: "1d" });
  if (!result.ok) return result;

  const meta = result.data.meta;
  const price = meta?.regularMarketPrice;
  const previousClose = meta?.chartPreviousClose ?? meta?.previousClose;

  if (typeof price !== "number" || Number.isNaN(price)) {
    return { ok: false, reason: "malformed_response", message: `Missing/invalid regularMarketPrice for ${ticker}` };
  }
  if (typeof previousClose !== "number" || Number.isNaN(previousClose)) {
    return { ok: false, reason: "malformed_response", message: `Missing/invalid previousClose for ${ticker}` };
  }

  return { ok: true, data: { price, previousClose } };
}

/** Fetches OHLC candles for a ticker at the given Yahoo range/interval. */
export async function fetchYahooCandles(
  ticker: string,
  params: { range: string; interval: string }
): Promise<YahooFetchResult<YahooCandle[]>> {
  const result = await fetchYahooChart(ticker, params);
  if (!result.ok) return result;

  const timestamps = result.data.timestamp;
  const quote = result.data.indicators?.quote?.[0];

  if (!Array.isArray(timestamps) || !quote || typeof quote !== "object") {
    return { ok: false, reason: "malformed_response", message: `No candle series returned for ${ticker}` };
  }

  const { open, high, low, close, volume } = quote;
  if (![open, high, low, close].every((arr) => Array.isArray(arr))) {
    return { ok: false, reason: "malformed_response", message: `Incomplete OHLC arrays for ${ticker}` };
  }

  const candles: YahooCandle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = open![i];
    const h = high![i];
    const l = low![i];
    const c = close![i];
    // Yahoo pads non-trading intervals (e.g. outside market hours) with
    // null OHLC values in an otherwise-valid array — skip those points
    // rather than plotting a fake zero or dropping the whole series.
    if (o == null || h == null || l == null || c == null) continue;
    if (![o, h, l, c].every((n) => typeof n === "number" && !Number.isNaN(n))) continue;

    candles.push({
      t: timestamps[i] * 1000,
      o,
      h,
      l,
      c,
      v: typeof volume?.[i] === "number" ? volume[i]! : null,
    });
  }

  if (candles.length === 0) {
    return { ok: false, reason: "malformed_response", message: `No usable candles for ${ticker}` };
  }

  return { ok: true, data: candles };
}
