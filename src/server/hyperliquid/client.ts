// Thin, server-only client around Hyperliquid's public (no API key, no
// wallet) perpetuals Info API. Mirrors yahoo-client.ts's shape exactly:
// this file's only job is to make one HTTP call and return either a
// normalized-enough result or a clearly-classified failure reason — it
// never invents data and never falls back to anything. Everything above
// this file (service.ts) decides caching/what to do with a failure.
//
// Single endpoint, POST, body varies by "type" — see
// https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint

import { getHyperliquidBaseUrl, getHyperliquidTimeoutMs } from "./config";

export type HyperliquidFailureReason =
  | "network_error"
  | "http_error"
  | "rate_limited"
  | "malformed_response";

export type HyperliquidFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: HyperliquidFailureReason; message: string };

async function postInfo<T>(body: Record<string, unknown>): Promise<HyperliquidFetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(getHyperliquidBaseUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(getHyperliquidTimeoutMs()),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[hyperliquid-client] network error for ${body.type}: ${reason}`);
    return { ok: false, reason: "network_error", message: "Network error reaching Hyperliquid" };
  }

  if (res.status === 429) {
    console.error(`[hyperliquid-client] rate limited for ${body.type}`);
    return { ok: false, reason: "rate_limited", message: "Hyperliquid rate limit exceeded" };
  }

  if (!res.ok) {
    console.error(`[hyperliquid-client] HTTP ${res.status} for ${body.type}`);
    return { ok: false, reason: "http_error", message: `Hyperliquid request failed (${res.status})` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[hyperliquid-client] non-JSON response for ${body.type}: ${reason}`);
    return { ok: false, reason: "malformed_response", message: "Hyperliquid returned an unreadable response" };
  }

  return { ok: true, data: json as T };
}

// --- Raw response shapes (only the fields this integration reads) ---

export type HyperliquidRawUniverseEntry = {
  name: string;
  szDecimals: number;
  maxLeverage: number;
};

export type HyperliquidRawMeta = {
  universe: HyperliquidRawUniverseEntry[];
};

export type HyperliquidRawAssetCtx = {
  dayNtlVlm: string;
  funding: string;
  markPx: string;
  midPx: string;
  openInterest: string;
  oraclePx: string;
  prevDayPx: string;
};

export type HyperliquidRawCandle = {
  T: number;
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  s: string;
  i: string;
};

export type HyperliquidRawBookLevel = {
  px: string;
  sz: string;
  n: number;
};

export type HyperliquidRawL2Book = {
  coin: string;
  time: number;
  levels: [HyperliquidRawBookLevel[], HyperliquidRawBookLevel[]];
};

function isRawMeta(value: unknown): value is HyperliquidRawMeta {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as HyperliquidRawMeta).universe) &&
    (value as HyperliquidRawMeta).universe.every(
      (u) => typeof u?.name === "string" && typeof u?.szDecimals === "number"
    )
  );
}

export async function fetchMeta(): Promise<HyperliquidFetchResult<HyperliquidRawMeta>> {
  const result = await postInfo<unknown>({ type: "meta" });
  if (!result.ok) return result;
  if (!isRawMeta(result.data)) {
    return { ok: false, reason: "malformed_response", message: "Hyperliquid meta response missing universe" };
  }
  return { ok: true, data: result.data };
}

export async function fetchMetaAndAssetCtxs(): Promise<
  HyperliquidFetchResult<[HyperliquidRawMeta, HyperliquidRawAssetCtx[]]>
> {
  const result = await postInfo<unknown>({ type: "metaAndAssetCtxs" });
  if (!result.ok) return result;

  const data = result.data;
  if (
    !Array.isArray(data) ||
    data.length !== 2 ||
    !isRawMeta(data[0]) ||
    !Array.isArray(data[1]) ||
    data[1].length !== data[0].universe.length
  ) {
    return {
      ok: false,
      reason: "malformed_response",
      message: "Hyperliquid metaAndAssetCtxs response was not the expected [meta, assetCtxs] shape",
    };
  }

  return { ok: true, data: data as [HyperliquidRawMeta, HyperliquidRawAssetCtx[]] };
}

export async function fetchCandleSnapshot(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<HyperliquidFetchResult<HyperliquidRawCandle[]>> {
  const result = await postInfo<unknown>({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
  if (!result.ok) return result;

  const data = result.data;
  if (
    !Array.isArray(data) ||
    !data.every(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof c.t === "number" &&
        typeof c.o === "string" &&
        typeof c.h === "string" &&
        typeof c.l === "string" &&
        typeof c.c === "string"
    )
  ) {
    return { ok: false, reason: "malformed_response", message: `Malformed candle series for ${coin}` };
  }

  if (data.length === 0) {
    return { ok: false, reason: "malformed_response", message: `No candles available for ${coin}` };
  }

  return { ok: true, data: data as HyperliquidRawCandle[] };
}

export async function fetchL2Book(coin: string): Promise<HyperliquidFetchResult<HyperliquidRawL2Book>> {
  const result = await postInfo<unknown>({ type: "l2Book", coin, nSigFigs: null });
  if (!result.ok) return result;

  const data = result.data as Partial<HyperliquidRawL2Book> | null;
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.levels) ||
    data.levels.length !== 2 ||
    !Array.isArray(data.levels[0]) ||
    !Array.isArray(data.levels[1])
  ) {
    return { ok: false, reason: "malformed_response", message: `Malformed order book for ${coin}` };
  }

  return { ok: true, data: data as HyperliquidRawL2Book };
}
