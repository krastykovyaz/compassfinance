import "server-only";

// Thin, low-level HTTP wrapper around Trading 212's real public API —
// verified against Trading 212's own docs (docs.trading212.com/api) and
// its help centre (Trading 212 API key article), not invented:
//   - Auth: HTTP Basic, API Key as username, API Secret as password
//     (Authorization: Basic base64(apiKey:apiSecret)) — a real key+secret
//     pair the user generates themselves in the Trading 212 app under
//     Settings > API (Beta), never an OAuth flow.
//   - Environments: https://live.trading212.com/api/v0 (real money) and
//     https://demo.trading212.com/api/v0 (paper/practice).
//   - GET /equity/account/info returns { currencyCode: string, id: number }
//     — `id` is the user's real Trading 212 account number, exactly what
//     this integration needs to confirm which account a credential
//     belongs to.
//
// Never logs the Authorization header, the raw apiKey/apiSecret, or a raw
// response body — see requestAccountInfo's own error handling.

const DEFAULT_LIVE_BASE_URL = "https://live.trading212.com/api/v0";
const DEFAULT_DEMO_BASE_URL = "https://demo.trading212.com/api/v0";
const DEFAULT_TIMEOUT_MS = 10_000;

function isTrading212Demo(): boolean {
  return process.env.TRADING212_ENVIRONMENT === "demo";
}

export function getTrading212BaseUrl(): string {
  if (process.env.TRADING212_API_BASE_URL) return process.env.TRADING212_API_BASE_URL;
  return isTrading212Demo() ? DEFAULT_DEMO_BASE_URL : DEFAULT_LIVE_BASE_URL;
}

function getTrading212TimeoutMs(): number {
  const configured = Number(process.env.TRADING212_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function buildAuthHeader(apiKey: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

export type Trading212AccountInfo = {
  id: string; // Trading 212's own int64 account number, stringified
  currencyCode: string;
};

export type Trading212FetchReason =
  | "unauthorized"
  | "network_error"
  | "malformed_response"
  | "rate_limited"
  // Phase 5: a real, recognized non-2xx response FROM Trading 212 itself
  // that isn't 401/403/429 — practically always a 5xx, i.e. Trading 212's
  // own infrastructure had a problem, not something wrong with our
  // request or its response shape. Distinguished from "malformed_response"
  // (a 2xx/4xx we couldn't parse or whose shape we didn't recognize)
  // specifically because THIS category is worth a bounded retry —
  // trading212GetWithRetry below only ever retries this and
  // "network_error".
  | "provider_error";

export type Trading212FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: Trading212FetchReason; message: string };

/** Calls Trading 212's real account-info endpoint with the given
 * credentials — the ONE call this integration ever makes with a
 * caller-supplied key/secret rather than a stored, encrypted one (see
 * trading212-provider.ts's validateCredentials, used only at connect
 * time before anything is persisted). Never throws for an
 * authentication failure — that's an expected, ordinary outcome here,
 * returned as a typed result instead. */
export async function fetchTrading212AccountInfo(
  apiKey: string,
  apiSecret: string
): Promise<Trading212FetchResult<Trading212AccountInfo>> {
  let res: Response;
  try {
    res = await fetch(`${getTrading212BaseUrl()}/equity/account/info`, {
      method: "GET",
      headers: { Authorization: buildAuthHeader(apiKey, apiSecret) },
      signal: AbortSignal.timeout(getTrading212TimeoutMs()),
    });
  } catch {
    // Never include the caught error itself — it could echo request
    // details (e.g. a URL with embedded auth in some fetch
    // implementations' error messages) into logs.
    return { ok: false, reason: "network_error", message: "Couldn't reach Trading 212" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "unauthorized", message: "Trading 212 rejected these credentials" };
  }
  if (res.status === 429) {
    return { ok: false, reason: "rate_limited", message: "Trading 212 is rate-limiting this request — try again shortly" };
  }
  if (res.status >= 500) {
    return { ok: false, reason: "provider_error", message: `Trading 212 returned a server error (${res.status})` };
  }
  if (!res.ok) {
    return { ok: false, reason: "malformed_response", message: `Trading 212 returned an unexpected status (${res.status})` };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "malformed_response", message: "Trading 212 returned an unreadable response" };
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("id" in data) ||
    (typeof (data as { id: unknown }).id !== "number" && typeof (data as { id: unknown }).id !== "string")
  ) {
    return { ok: false, reason: "malformed_response", message: "Trading 212's response didn't include an account id" };
  }

  const raw = data as { id: number | string; currencyCode?: unknown };
  return {
    ok: true,
    data: {
      id: String(raw.id),
      currencyCode: typeof raw.currencyCode === "string" ? raw.currencyCode : "",
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — read-only sync endpoints. Every field below is read
// DEFENSIVELY: multiple independently-researched sources gave conflicting
// exact shapes for some of these (in particular /equity/portfolio — flat
// `ticker`/`averagePrice` vs a nested `instrument{}`/`walletImpact{}`
// shape), so each getter checks every plausible location for a value and
// leaves it `undefined`/omits the record rather than fabricate a number
// Trading 212 never actually returned. This is a deliberate, narrow
// exception to "never invent fields" — it reads more field name
// candidates than any single source confirms, but never invents a VALUE,
// only a location to look for one Trading 212 actually sent.
// ---------------------------------------------------------------------------

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
/** Returns the first defined value found by trying each candidate path
 * against `obj`, in order — the defensive-parsing primitive every getter
 * below is built on. */
function firstOf<T>(obj: unknown, paths: string[][], reader: (v: unknown) => T | undefined): T | undefined {
  for (const path of paths) {
    const value = reader(get(obj, path));
    if (value !== undefined) return value;
  }
  return undefined;
}

async function trading212Get(
  apiKey: string,
  apiSecret: string,
  path: string,
  query?: Record<string, string>
): Promise<Trading212FetchResult<unknown>> {
  const url = new URL(`${getTrading212BaseUrl()}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: buildAuthHeader(apiKey, apiSecret) },
      signal: AbortSignal.timeout(getTrading212TimeoutMs()),
    });
  } catch {
    return { ok: false, reason: "network_error", message: "Couldn't reach Trading 212" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "unauthorized", message: "Trading 212 rejected these credentials" };
  }
  if (res.status === 429) {
    return { ok: false, reason: "rate_limited", message: "Trading 212 is rate-limiting this request — try again shortly" };
  }
  if (res.status >= 500) {
    return { ok: false, reason: "provider_error", message: `Trading 212 returned a server error (${res.status})` };
  }
  if (!res.ok) {
    return { ok: false, reason: "malformed_response", message: `Trading 212 returned an unexpected status (${res.status})` };
  }

  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, reason: "malformed_response", message: "Trading 212 returned an unreadable response" };
  }
}

const RETRYABLE_REASONS: readonly Trading212FetchReason[] = ["network_error", "provider_error"];
// Requirement 10: a bounded, documented retry policy — 2 retries (3
// attempts total) with exponential backoff, and ONLY for the two
// genuinely-transient reasons above. Never retried: "unauthorized" (wrong
// credentials — retrying can't fix that), "malformed_response" (a shape
// problem — retrying gets the same shape again), "rate_limited" (retrying
// immediately would make the rate-limit pressure worse; Trading 212 gets
// tried again on the NEXT scheduled sync cycle instead, which is already
// a natural multi-minute backoff — see trading212-scheduler.ts).
const RETRY_DELAYS_MS = [300, 900];

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wraps trading212Get with the bounded retry policy above. Used by every
 * sync-data fetcher below EXCEPT fetchTrading212AccountInfo, which is the
 * connect-time credential-validation call — that one must fail fast so a
 * user typing in a bad API key gets immediate feedback, not a multi-second
 * retry loop. */
async function trading212GetWithRetry(
  apiKey: string,
  apiSecret: string,
  path: string,
  query?: Record<string, string>
): Promise<Trading212FetchResult<unknown>> {
  let attempt = 0;
  for (;;) {
    const result = await trading212Get(apiKey, apiSecret, path, query);
    if (result.ok || !RETRYABLE_REASONS.includes(result.reason) || attempt >= RETRY_DELAYS_MS.length) {
      return result;
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
    attempt++;
  }
}

export type Trading212AccountSummary = {
  currencyCode?: string;
  totalValue?: number;
  cashAvailable?: number;
  cashInPies?: number;
  cashReserved?: number;
  investedValue?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
};

/** GET /equity/account/summary — cash + investment breakdown. Every field
 * is optional in the returned shape: this endpoint's exact fields are the
 * least-corroborated of any used here, so a missing field means "Trading
 * 212 didn't send this," not zero. */
export async function fetchTrading212AccountSummary(
  apiKey: string,
  apiSecret: string
): Promise<Trading212FetchResult<Trading212AccountSummary>> {
  const result = await trading212GetWithRetry(apiKey, apiSecret, "/equity/account/summary");
  if (!result.ok) return result;
  const d = result.data;
  return {
    ok: true,
    data: {
      currencyCode: firstOf(d, [["currency"], ["currencyCode"]], str),
      totalValue: firstOf(d, [["totalValue"]], num),
      cashAvailable: firstOf(d, [["cash", "availableToTrade"], ["free"]], num),
      cashInPies: firstOf(d, [["cash", "inPies"], ["pieCash"]], num),
      cashReserved: firstOf(d, [["cash", "reservedForOrders"], ["blocked"]], num),
      investedValue: firstOf(d, [["investments", "currentValue"], ["invested"]], num),
      realizedPnl: firstOf(d, [["investments", "realizedProfitLoss"], ["result"]], num),
      unrealizedPnl: firstOf(d, [["investments", "unrealizedProfitLoss"], ["ppl"]], num),
    },
  };
}

export type Trading212Position = {
  externalTicker: string;
  externalName?: string;
  currencyCode?: string;
  quantity: number;
  averagePrice?: number;
  currentPrice?: number;
  unrealizedPnl?: number;
};

/** GET /equity/portfolio — currently open positions. `ticker` is the one
 * field every source agrees on and the only one treated as required;
 * everything else is read defensively (see file header) and omitted, not
 * guessed, when absent. Entries with no readable ticker or quantity are
 * dropped — a position CompassFinance can't identify is not one it can
 * safely display, per "never fabricate a value." */
export async function fetchTrading212Positions(
  apiKey: string,
  apiSecret: string
): Promise<Trading212FetchResult<Trading212Position[]>> {
  const result = await trading212GetWithRetry(apiKey, apiSecret, "/equity/portfolio");
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return { ok: false, reason: "malformed_response", message: "Trading 212 returned an unexpected portfolio shape" };
  }

  const positions: Trading212Position[] = [];
  for (const item of result.data) {
    const externalTicker = firstOf(item, [["ticker"], ["instrument", "ticker"]], str);
    const quantity = firstOf(item, [["quantity"]], num);
    if (externalTicker === undefined || quantity === undefined) continue;
    positions.push({
      externalTicker,
      externalName: firstOf(item, [["instrument", "name"]], str),
      currencyCode: firstOf(item, [["instrument", "currency"], ["walletImpact", "currency"]], str),
      quantity,
      averagePrice: firstOf(item, [["averagePrice"], ["averagePricePaid"]], num),
      currentPrice: firstOf(item, [["currentPrice"]], num),
      unrealizedPnl: firstOf(item, [["ppl"], ["walletImpact", "unrealizedProfitLoss"]], num),
    });
  }
  return { ok: true, data: positions };
}

export type Trading212PagedResult<T> = { items: T[]; nextCursor: string | null };

/** Extracts a continuation cursor from a paginated Trading 212 history
 * response. These endpoints have been observed/documented to return
 * either a direct `cursor`-shaped continuation field or a `nextPagePath`
 * URL carrying the next cursor as a query param — this checks both
 * without assuming either is present (Requirement 5: pagination must
 * terminate cleanly, not loop forever on a shape mismatch). */
function extractNextCursor(data: unknown): string | null {
  const direct = firstOf(data, [["nextCursor"]], str);
  if (direct) return direct;
  const nextPagePath = firstOf(data, [["nextPagePath"]], str);
  if (nextPagePath) {
    try {
      const parsed = new URL(nextPagePath, "https://placeholder.invalid");
      return parsed.searchParams.get("cursor");
    } catch {
      return null;
    }
  }
  return null;
}
function extractItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const items = get(data, ["items"]);
  return Array.isArray(items) ? items : [];
}

export type Trading212Order = {
  externalId: string;
  externalTicker: string;
  externalName?: string;
  side?: string;
  status?: string;
  quantity?: number;
  filledQuantity?: number;
  /** Per-unit executed price — either a genuine per-unit field Trading
   * 212 reported, or mechanically derived as filledValue/filledQuantity
   * when only the aggregate is available (see below: a real division of
   * two real numbers, not an estimate). */
  fillPrice?: number;
  /** The real, aggregate executed value Trading 212 reported for this
   * fill (its own `filledValue`) — kept as its OWN field rather than
   * folded into fillPrice. Phase 2 conflated these under one "fillPrice"
   * key via a firstOf() fallback chain, which meant a response shaped
   * with only an aggregate `filledValue` (no genuine per-unit field) got
   * silently stored AS IF it were a per-share price — a real bug fixed
   * in Phase 4's activity-model audit. */
  filledValue?: number;
  currencyCode?: string;
  externalCreatedAt: string; // ISO
};

/** GET /equity/history/orders — completed/historical orders (distinct
 * from GET /equity/orders, which is only currently-pending orders and is
 * intentionally NOT used here — Phase 2 is history, not live order
 * state). Cursor-paginated, rate-limited to 6 calls/minute per Trading
 * 212's own docs — callers should page conservatively (see
 * trading212-sync.ts). Entries with no id, ticker, or creation time are
 * dropped: an order sync can't be idempotent without a real externalId. */
export async function fetchTrading212OrderHistoryPage(
  apiKey: string,
  apiSecret: string,
  cursor?: string
): Promise<Trading212FetchResult<Trading212PagedResult<Trading212Order>>> {
  const result = await trading212GetWithRetry(apiKey, apiSecret, "/equity/history/orders", cursor ? { cursor, limit: "50" } : { limit: "50" });
  if (!result.ok) return result;

  const items: Trading212Order[] = [];
  for (const item of extractItems(result.data)) {
    const externalId = firstOf(item, [["id"]], (v) => (v === undefined ? undefined : String(v)));
    const externalTicker = firstOf(item, [["ticker"], ["instrument", "ticker"]], str);
    const externalCreatedAt = firstOf(item, [["dateCreated"], ["createdAt"], ["dateExecuted"]], str);
    if (externalId === undefined || externalTicker === undefined || externalCreatedAt === undefined) continue;

    const filledQuantity = firstOf(item, [["filledQuantity"]], num);
    const filledValue = firstOf(item, [["filledValue"]], num);
    // Only genuine per-unit price fields here — `filledValue` (the
    // aggregate) is handled as its own field above, never folded in.
    const reportedFillPrice = firstOf(item, [["fillPrice"], ["averageFillPrice"], ["executionPrice"]], num);
    const fillPrice =
      reportedFillPrice ?? (filledValue != null && filledQuantity ? filledValue / filledQuantity : undefined);

    items.push({
      externalId,
      externalTicker,
      externalName: firstOf(item, [["instrument", "name"]], str),
      side: firstOf(item, [["side"]], str),
      status: firstOf(item, [["status"]], str),
      quantity: firstOf(item, [["quantity"]], num),
      filledQuantity,
      fillPrice,
      filledValue,
      currencyCode: firstOf(item, [["currency"]], str),
      externalCreatedAt,
    });
  }
  return { ok: true, data: { items, nextCursor: extractNextCursor(result.data) } };
}

export type Trading212Dividend = {
  externalId: string;
  externalTicker?: string;
  externalName?: string;
  quantity?: number;
  amount: number;
  grossAmountPerShare?: number;
  currencyCode?: string;
  externalCreatedAt: string;
};

/** GET /history/dividends — dividend payments, cursor-paginated. Entries
 * with no readable amount or paid-date are dropped, same reasoning as
 * orders above. */
export async function fetchTrading212DividendsPage(
  apiKey: string,
  apiSecret: string,
  cursor?: string
): Promise<Trading212FetchResult<Trading212PagedResult<Trading212Dividend>>> {
  const result = await trading212GetWithRetry(apiKey, apiSecret, "/history/dividends", cursor ? { cursor, limit: "50" } : { limit: "50" });
  if (!result.ok) return result;

  const items: Trading212Dividend[] = [];
  for (const item of extractItems(result.data)) {
    const amount = firstOf(item, [["amount"], ["amountInEuro"]], num);
    const externalCreatedAt = firstOf(item, [["paidOn"], ["dateCreated"]], str);
    if (amount === undefined || externalCreatedAt === undefined) continue;
    const externalTicker = firstOf(item, [["ticker"], ["instrument", "ticker"]], str);
    items.push({
      // Trading 212's dividend records don't consistently expose a
      // dedicated numeric id in the sources reviewed — `reference` is the
      // field every source names for this purpose, falling back to a
      // composite of ticker+paidOn+amount only as a last resort so this
      // record still has SOME stable idempotency key rather than being
      // dropped entirely.
      externalId: firstOf(item, [["reference"], ["id"]], (v) => (v === undefined ? undefined : String(v))) ??
        `${externalTicker ?? "unknown"}:${externalCreatedAt}:${amount}`,
      externalTicker,
      externalName: firstOf(item, [["instrument", "name"]], str),
      quantity: firstOf(item, [["quantity"]], num),
      amount,
      grossAmountPerShare: firstOf(item, [["grossAmountPerShare"]], num),
      currencyCode: firstOf(item, [["currency"]], str),
      externalCreatedAt,
    });
  }
  return { ok: true, data: { items, nextCursor: extractNextCursor(result.data) } };
}

export type Trading212Transaction = {
  externalId: string;
  type: string;
  amount: number;
  currencyCode?: string;
  externalCreatedAt: string;
};

/** GET /history/transactions — deposits/withdrawals/fees/transfers.
 * Trading 212's own docs state these "cannot be filtered by time —
 * pagination is the only way to navigate through historical data," so
 * this always pages from the most recent entry forward via `cursor`. */
export async function fetchTrading212TransactionsPage(
  apiKey: string,
  apiSecret: string,
  cursor?: string
): Promise<Trading212FetchResult<Trading212PagedResult<Trading212Transaction>>> {
  const result = await trading212GetWithRetry(apiKey, apiSecret, "/history/transactions", cursor ? { cursor, limit: "50" } : { limit: "50" });
  if (!result.ok) return result;

  const items: Trading212Transaction[] = [];
  for (const item of extractItems(result.data)) {
    const amount = firstOf(item, [["amount"]], num);
    const type = firstOf(item, [["type"]], str);
    const externalCreatedAt = firstOf(item, [["dateTime"], ["dateCreated"]], str);
    if (amount === undefined || type === undefined || externalCreatedAt === undefined) continue;
    items.push({
      externalId:
        firstOf(item, [["reference"], ["id"]], (v) => (v === undefined ? undefined : String(v))) ??
        `${type}:${externalCreatedAt}:${amount}`,
      type,
      amount,
      currencyCode: firstOf(item, [["currency"]], str),
      externalCreatedAt,
    });
  }
  return { ok: true, data: { items, nextCursor: extractNextCursor(result.data) } };
}
