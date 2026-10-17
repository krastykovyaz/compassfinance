import "server-only";
import { firstElementText } from "./interactive-brokers-flex-xml";

// Interactive Brokers Flex Web Service client: the personal-account route.
// The account holder creates a Flex Query and an access token in their own
// IBKR Client Portal and pastes both into CompassFinance; no vendor
// approval, no gateway process and no IBKR password is involved. A Flex
// token only returns reports: it cannot place or change anything.
//
// Two calls, per IBKR's documentation:
//   1. SendRequest?t=<token>&q=<queryId>&v=3  -> a ReferenceCode
//   2. GetStatement?t=<token>&q=<referenceCode>&v=3 -> the report XML
//      (or a "still generating" status, in which case it is asked again)
//
// The token travels in the URL query string because that is how IBKR
// defines the service. So this module never logs a URL, never puts one in
// an error, never follows a redirect (which would forward the token to
// another address), and returns only fixed, sanitized messages.

const FLEX_BASE_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const USER_AGENT = "CompassFinance/1.0"; // IBKR rejects requests that carry no User-Agent
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAX_STATEMENT_POLLS = 5;
const POLL_DELAY_MS = 2_500;
// Total time one fetchFlexReport call may take, both steps and all polls
// included. The sync runs inside a single HTTP request, and the reverse
// proxy in front of the app closes a request after 60 seconds (nginx's
// default proxy_read_timeout): past that the browser gets a 504 while the
// sync keeps running, and a retry is refused as "already syncing". So the
// whole fetch has to finish, one way or the other, well inside that.
const FETCH_DEADLINE_MS = 45_000;
// Not worth starting a request with less time than this left.
const MIN_REQUEST_TIME_MS = 3_000;

export type FlexCredentials = { token: string; queryId: string };

export type FlexFetchReason =
  | "invalid_token"
  | "token_expired"
  | "ip_restricted"
  | "invalid_query"
  | "rate_limited"
  | "not_ready"
  | "network_error"
  | "provider_error"
  | "malformed_response"
  | "too_large";

export type FlexFetchResult<T> = { ok: true; data: T } | { ok: false; reason: FlexFetchReason; message: string };

const MESSAGES: Record<Exclude<FlexFetchReason, "provider_error">, string> = {
  invalid_token: "Interactive Brokers rejected this Flex token. Check that it was copied exactly.",
  token_expired: "This Flex token has expired. Generate a new one in your Interactive Brokers account.",
  ip_restricted: "This Flex token is limited to other IP addresses. Remove the IP restriction in Interactive Brokers.",
  invalid_query: "Interactive Brokers doesn't recognise this Flex Query ID. Check the number.",
  rate_limited: "Interactive Brokers is limiting Flex requests right now. Try again in a minute.",
  not_ready: "The Interactive Brokers report isn't ready yet. Try again shortly.",
  network_error: "Couldn't reach Interactive Brokers.",
  malformed_response: "Interactive Brokers returned a report this app couldn't read.",
  too_large: "The Interactive Brokers report is too large. Shorten the period in your Flex Query.",
};

function fail<T>(reason: FlexFetchReason, code?: string): FlexFetchResult<T> {
  if (reason === "provider_error") {
    const safeCode = code && /^\d{1,6}$/.test(code) ? ` (code ${code})` : "";
    return { ok: false, reason, message: `Interactive Brokers returned an error${safeCode}.` };
  }
  return { ok: false, reason, message: MESSAGES[reason] };
}

/** IBKR's documented Flex error codes, grouped by what the user or the
 * app can do about them. Anything unlisted is a generic provider error
 * that carries only its (digits-only) code. */
function reasonForErrorCode(code: string | null): FlexFetchReason {
  switch (code) {
    case "1012":
      return "token_expired";
    case "1015":
      return "invalid_token";
    case "1013":
      return "ip_restricted";
    case "1014":
      return "invalid_query";
    case "1018":
      return "rate_limited";
    case "1001":
    case "1004":
    case "1005":
    case "1006":
    case "1007":
    case "1008":
    case "1009":
    case "1019":
    case "1021":
      return "not_ready";
    default:
      return "provider_error";
  }
}

async function readCapped(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) return null;
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function flexGet(path: string, params: Record<string, string>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<FlexFetchResult<string>> {
  const url = new URL(`${FLEX_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("v", "3");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // The caught error is dropped on purpose: some fetch implementations
    // put the request URL, which holds the token, in the message.
    return fail("network_error");
  }

  if (res.status === 429) return fail("rate_limited");
  if (!res.ok) return fail("provider_error", String(res.status));

  let text: string | null;
  try {
    text = await readCapped(res);
  } catch {
    return fail("network_error");
  }
  if (text === null) return fail("too_large");
  return { ok: true, data: text };
}

/** The status envelope IBKR answers a failed or still-running request with. */
function envelopeFailure(xml: string): FlexFetchResult<never> | null {
  if (!xml.includes("<FlexStatementResponse")) return null;
  const status = firstElementText(xml, "Status");
  if (status === "Success") return null;
  const code = firstElementText(xml, "ErrorCode");
  return fail(reasonForErrorCode(code), code ?? undefined) as FlexFetchResult<never>;
}

/** Step 1 alone. Enough to prove a token and query ID are valid, which is
 * what the connect form needs before it stores anything. */
export async function requestFlexReport(credentials: FlexCredentials): Promise<FlexFetchResult<{ referenceCode: string }>> {
  const response = await flexGet("SendRequest", { t: credentials.token, q: credentials.queryId });
  if (!response.ok) return response;
  const failure = envelopeFailure(response.data);
  if (failure) return failure;
  const referenceCode = firstElementText(response.data, "ReferenceCode");
  if (!referenceCode || !/^\w{1,64}$/.test(referenceCode)) return fail("malformed_response");
  return { ok: true, data: { referenceCode } };
}

export type FlexFetchOptions = {
  sleep?: (ms: number) => Promise<void>;
  /** Clock, for tests. */
  now?: () => number;
};

/** Both steps: request the report, then collect it, asking again while
 * IBKR says it is still being generated, all within FETCH_DEADLINE_MS. When
 * the deadline arrives first the result is not_ready: the user can sync
 * again, and IBKR usually has the report by then. */
export async function fetchFlexReport(credentials: FlexCredentials, options?: FlexFetchOptions): Promise<FlexFetchResult<string>> {
  const sleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options?.now ?? Date.now;
  const deadline = now() + FETCH_DEADLINE_MS;
  const remaining = () => deadline - now();

  const requested = await requestFlexReport(credentials);
  if (!requested.ok) return requested;

  for (let attempt = 0; attempt < MAX_STATEMENT_POLLS; attempt++) {
    if (attempt > 0) await sleep(Math.min(POLL_DELAY_MS, Math.max(0, remaining())));
    if (remaining() < MIN_REQUEST_TIME_MS) return fail("not_ready");
    const response = await flexGet("GetStatement", { t: credentials.token, q: requested.data.referenceCode }, Math.min(REQUEST_TIMEOUT_MS, remaining()));
    if (!response.ok) return response;
    const failure = envelopeFailure(response.data);
    if (failure === null) return { ok: true, data: response.data };
    if (failure.ok || failure.reason !== "not_ready") return failure;
  }
  return fail("not_ready");
}
