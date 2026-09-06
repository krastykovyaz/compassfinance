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

export type Trading212FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unauthorized" | "network_error" | "malformed_response" | "rate_limited"; message: string };

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
