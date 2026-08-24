// Thin, server-only client around Hyperliquid's public (no API key, no
// wallet) perpetuals Info API. Mirrors yahoo-client.ts's shape exactly:
// this file's only job is to make one HTTP call and return either a
// normalized-enough result or a clearly-classified failure reason — it
// never invents data and never falls back to anything. Everything above
// this file (service.ts) decides caching/what to do with a failure.
//
// Single endpoint, POST, body varies by "type" — see
// https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint

import { getHyperliquidBaseUrl, getHyperliquidExchangeUrl, getHyperliquidTimeoutMs } from "./config";

export type HyperliquidFailureReason =
  | "network_error"
  | "http_error"
  | "rate_limited"
  | "malformed_response";

export type HyperliquidFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: HyperliquidFailureReason; message: string };

// Shared POST + classify logic for both the read-only /info endpoint and
// the signed-write /exchange endpoint — same failure modes, same honest
// "never invent a substitute value" stance either way. `logLabel` is just
// what appears in the server log line, never sent upstream.
async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  logLabel: string
): Promise<HyperliquidFetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(getHyperliquidTimeoutMs()),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[hyperliquid-client] network error for ${logLabel}: ${reason}`);
    return { ok: false, reason: "network_error", message: "Network error reaching Hyperliquid" };
  }

  if (res.status === 429) {
    console.error(`[hyperliquid-client] rate limited for ${logLabel}`);
    return { ok: false, reason: "rate_limited", message: "Hyperliquid rate limit exceeded" };
  }

  if (!res.ok) {
    console.error(`[hyperliquid-client] HTTP ${res.status} for ${logLabel}`);
    return { ok: false, reason: "http_error", message: `Hyperliquid request failed (${res.status})` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[hyperliquid-client] non-JSON response for ${logLabel}: ${reason}`);
    return { ok: false, reason: "malformed_response", message: "Hyperliquid returned an unreadable response" };
  }

  return { ok: true, data: json as T };
}

async function postInfo<T>(body: Record<string, unknown>): Promise<HyperliquidFetchResult<T>> {
  return postJson<T>(getHyperliquidBaseUrl(), body, String(body.type));
}

// Relays an ALREADY-SIGNED action to Hyperliquid's write endpoint. This
// function never signs anything and never sees a private key — `body` is
// exactly `{action, nonce, signature}` produced client-side, inside the
// user's own wallet, before this is ever called. Exported (unlike
// postInfo) because service.ts's submitHyperliquidExchangeAction() must
// forward the caller's `action` object byte-identical, never reconstructed
// — the signature's hash depends on the exact shape/key-order that was
// signed, so this stays a thin pass-through with no shape transformation.
export async function postExchange<T>(body: {
  action: Record<string, unknown>;
  nonce: number;
  signature: { r: string; s: string; v: number };
}): Promise<HyperliquidFetchResult<T>> {
  return postJson<T>(getHyperliquidExchangeUrl(), body, String(body.action.type));
}

// --- Raw response shapes (only the fields this integration reads) ---

export type HyperliquidRawUniverseEntry = {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  /** True when Hyperliquid has delisted this specific market — verified
   * live, real for some HIP-3 testnet markets (e.g. xyz:SP500 was
   * delisted on testnet while fully live on mainnet) even though the
   * name still appears in `meta`. Optional/undefined on raw responses
   * that don't include it (the field simply isn't present rather than
   * false), so callers must treat undefined the same as false — never
   * assume "present and false" vs "absent" means anything different. */
  isDelisted?: boolean;
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

// `dex` is Hyperliquid's own builder-deployed (HIP-3) perp dex name (e.g.
// "xyz") — omitted (or "") means the default/main dex, exactly matching
// Hyperliquid's own convention everywhere it accepts this parameter.
export async function fetchMeta(dex?: string): Promise<HyperliquidFetchResult<HyperliquidRawMeta>> {
  const result = await postInfo<unknown>({ type: "meta", ...(dex ? { dex } : {}) });
  if (!result.ok) return result;
  if (!isRawMeta(result.data)) {
    return { ok: false, reason: "malformed_response", message: "Hyperliquid meta response missing universe" };
  }
  return { ok: true, data: result.data };
}

export async function fetchMetaAndAssetCtxs(
  dex?: string
): Promise<HyperliquidFetchResult<[HyperliquidRawMeta, HyperliquidRawAssetCtx[]]>> {
  const result = await postInfo<unknown>({ type: "metaAndAssetCtxs", ...(dex ? { dex } : {}) });
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

export type HyperliquidRawPerpDex = {
  name: string;
  fullName: string;
  deployer: string;
  oracleUpdater: string | null;
} | null; // null is the main/default dex's own placeholder slot in the list

// Phase 8 — enumerates every builder-deployed (HIP-3) perp dex Hyperliquid
// currently knows about, most importantly each one's POSITION in this
// array: that position IS the "perp_dex_index" Hyperliquid's own asset-id
// formula (100000 + perp_dex_index*10000 + index_in_meta) requires for
// building a valid order/leverage action against that dex — see
// markets.ts's getHyperliquidPerpDexIndex, the one place this gets used.
export async function fetchPerpDexs(): Promise<HyperliquidFetchResult<HyperliquidRawPerpDex[]>> {
  const result = await postInfo<unknown>({ type: "perpDexs" });
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return { ok: false, reason: "malformed_response", message: "Hyperliquid perpDexs response was not an array" };
  }
  return { ok: true, data: result.data as HyperliquidRawPerpDex[] };
}

export type HyperliquidRawSpotToken = {
  name: string;
  index: number;
  tokenId: string;
};

// Only the fields this integration actually needs (resolving USDC's real
// tokenId for a sendAsset transfer, see markets.ts's getUsdcTokenId) — the
// real response carries many more per-token fields this app never reads.
export async function fetchSpotMeta(): Promise<HyperliquidFetchResult<{ tokens: HyperliquidRawSpotToken[] }>> {
  const result = await postInfo<unknown>({ type: "spotMeta" });
  if (!result.ok) return result;
  const data = result.data as { tokens?: unknown } | null;
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.tokens) ||
    !data.tokens.every(
      (t) => t && typeof t.name === "string" && typeof t.index === "number" && typeof t.tokenId === "string"
    )
  ) {
    return { ok: false, reason: "malformed_response", message: "Hyperliquid spotMeta response missing tokens" };
  }
  return { ok: true, data: data as { tokens: HyperliquidRawSpotToken[] } };
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

// --- Account (Phase 2) — same single public endpoint, no auth: every call
// is keyed by a wallet address only, never a private key or signature. ---

export type HyperliquidRawPosition = {
  coin: string;
  szi: string;
  entryPx: string | null;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
  unrealizedPnl: string;
  marginUsed: string;
  positionValue: string;
};

export type HyperliquidRawAssetPosition = {
  position: HyperliquidRawPosition;
  type: string;
};

export type HyperliquidRawMarginSummary = {
  accountValue: string;
  totalMarginUsed: string;
  totalNtlPos: string;
  totalRawUsd: string;
};

export type HyperliquidRawClearinghouseState = {
  assetPositions: HyperliquidRawAssetPosition[];
  marginSummary: HyperliquidRawMarginSummary;
  withdrawable: string;
  time: number;
};

export type HyperliquidRawOpenOrder = {
  coin: string;
  limitPx: string;
  oid: number;
  side: "A" | "B";
  sz: string;
  timestamp: number;
};

export type HyperliquidRawFill = {
  coin: string;
  side: "A" | "B";
  px: string;
  sz: string;
  closedPnl: string;
  fee: string;
  time: number;
  oid: number;
};

// Phase 8: HIP-3 dexes hold their OWN isolated margin/collateral pool,
// verified live — the same address has a genuinely different
// accountValue with `dex: "xyz"` than without it, not just a filtered
// view of one shared balance. `dex` omitted (or "") means the main dex,
// exactly as documented.
export async function fetchClearinghouseState(
  user: string,
  dex?: string
): Promise<HyperliquidFetchResult<HyperliquidRawClearinghouseState>> {
  const result = await postInfo<unknown>({ type: "clearinghouseState", user, ...(dex ? { dex } : {}) });
  if (!result.ok) return result;

  const data = result.data as Partial<HyperliquidRawClearinghouseState> | null;
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.assetPositions) ||
    typeof data.marginSummary?.accountValue !== "string" ||
    typeof data.withdrawable !== "string"
  ) {
    return { ok: false, reason: "malformed_response", message: `Malformed clearinghouse state for ${user}` };
  }

  return { ok: true, data: data as HyperliquidRawClearinghouseState };
}

// Hyperliquid's "Unified Account Mode" — an account-level setting a user
// enables in Hyperliquid's own app, not something CompassFinance controls.
// Once enabled, per Hyperliquid's docs, the classic clearinghouseState
// balance/withdrawable figures above stop being meaningful: real
// collateral is unified with the spot balance instead. This one extra
// call is how service.ts detects whether that override applies for a
// given address.
export async function fetchUserAbstraction(user: string): Promise<HyperliquidFetchResult<string | null>> {
  const result = await postInfo<unknown>({ type: "userAbstraction", user });
  if (!result.ok) return result;

  const data = result.data;
  if (data !== null && typeof data !== "string") {
    return { ok: false, reason: "malformed_response", message: `Malformed userAbstraction for ${user}` };
  }
  return { ok: true, data };
}

export type HyperliquidRawSpotBalance = {
  coin: string;
  token: number;
  total: string;
  hold: string;
  entryNtl: string;
};

export type HyperliquidRawSpotClearinghouseState = {
  balances: HyperliquidRawSpotBalance[];
  // [tokenId, availableAfterMaintenanceAsString][] — present on Hyperliquid's
  // real responses but not documented as guaranteed, so treated as optional.
  tokenToAvailableAfterMaintenance?: [number, string][];
};

export async function fetchSpotClearinghouseState(
  user: string
): Promise<HyperliquidFetchResult<HyperliquidRawSpotClearinghouseState>> {
  const result = await postInfo<unknown>({ type: "spotClearinghouseState", user });
  if (!result.ok) return result;

  const data = result.data as Partial<HyperliquidRawSpotClearinghouseState> | null;
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.balances) ||
    !data.balances.every((b) => b && typeof b.coin === "string" && typeof b.total === "string")
  ) {
    return { ok: false, reason: "malformed_response", message: `Malformed spot clearinghouse state for ${user}` };
  }

  return { ok: true, data: data as HyperliquidRawSpotClearinghouseState };
}

// Per Hyperliquid's own docs, "dex" here defaults to the main dex only —
// unlike userFills below, open orders on a HIP-3 dex are NOT included
// unless this is explicitly passed.
export async function fetchOpenOrders(
  user: string,
  dex?: string
): Promise<HyperliquidFetchResult<HyperliquidRawOpenOrder[]>> {
  const result = await postInfo<unknown>({ type: "openOrders", user, ...(dex ? { dex } : {}) });
  if (!result.ok) return result;

  const data = result.data;
  // An empty array is a completely normal, valid "no open orders" state —
  // unlike candles, never treated as malformed.
  if (!Array.isArray(data) || !data.every((o) => o && typeof o.coin === "string" && typeof o.oid === "number")) {
    return { ok: false, reason: "malformed_response", message: `Malformed open orders for ${user}` };
  }

  return { ok: true, data: data as HyperliquidRawOpenOrder[] };
}

export async function fetchUserFills(user: string): Promise<HyperliquidFetchResult<HyperliquidRawFill[]>> {
  const result = await postInfo<unknown>({ type: "userFills", user });
  if (!result.ok) return result;

  const data = result.data;
  // Empty is normal ("no trade history yet"), never treated as malformed.
  if (!Array.isArray(data) || !data.every((f) => f && typeof f.coin === "string" && typeof f.time === "number")) {
    return { ok: false, reason: "malformed_response", message: `Malformed fills for ${user}` };
  }

  return { ok: true, data: data as HyperliquidRawFill[] };
}
