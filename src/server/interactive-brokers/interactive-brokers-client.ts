import "server-only";
import {
  getInteractiveBrokersApiBaseUrl,
  getInteractiveBrokersAuthorizeBaseUrl,
  getInteractiveBrokersConfig,
  getInteractiveBrokersDhGenerator,
  getInteractiveBrokersRealm,
  getInteractiveBrokersSyncConfig,
} from "./interactive-brokers-config";
import { buildOAuthAuthorizationHeader } from "./interactive-brokers-oauth-signer";
import { buildAuthenticatedRequestAuthorizationHeader } from "./interactive-brokers-authenticated-request-signer";
import {
  buildLiveSessionTokenRequestAuthorizationHeader,
  computeDiffieHellmanChallenge,
  decryptAccessTokenSecret,
  deriveLiveSessionToken,
  generateDhRandom,
  verifyLiveSessionToken,
} from "./interactive-brokers-live-session-token";

// Thin, low-level HTTP wrapper around the two IBKR OAuth 1.0a Third-Party
// endpoints Phase 1 actually needs — verified against IBKR's own docs
// (ibkrcampus.com/docs/web-api/authentication/oauth-1a/third-party-oauth/
// third-party-o-auth-workflow.md, cited in
// docs/integrations/interactive-brokers-phase-0.md):
//   - POST /v1/api/oauth/request_token — RSA-SHA256 signed, no body/query
//     params beyond the OAuth ones; returns a request token used ONCE to
//     build the user's authorize-redirect URL.
//   - POST /v1/api/oauth/access_token — RSA-SHA256 signed, with
//     oauth_token (the request token) and oauth_verifier (from the
//     callback) in the Authorization header; returns the long-lived
//     Access Token + Access Token Secret pair.
//
// Deliberately, permanently absent from this file: any reference to the
// iserver/auth/ssodh/init endpoint, or any other endpoint under IBKR's
// iserver namespace. That omission IS the architectural read-only
// guarantee for this whole integration —
// see docs/integrations/interactive-brokers-phase-0.md §13: the IBKR
// OAuth token is not protocol-level read-only, so CompassFinance enforces
// read-only behavior by simply never calling a trading endpoint. See
// no-iserver-access.test.ts, which fails if this ever changes.
//
// Never logs the Authorization header, the RSA private key, or a raw
// response body — same discipline as trading212-client.ts's own header
// comment.

const DEFAULT_TIMEOUT_MS = 15_000;

function getTimeoutMs(): number {
  const configured = Number(process.env.IBKR_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

export type InteractiveBrokersFetchReason =
  | "not_configured"
  | "unauthorized"
  | "network_error"
  | "malformed_response"
  | "provider_error"
  // Phase 2 — IBKR's own documented portfolio-endpoint pacing limits
  // (see docs/integrations/interactive-brokers-phase-0.md §11) make this
  // a real, reachable outcome for /portfolio/* calls in a way Phase 1's
  // one-time OAuth handshake calls never needed to classify.
  | "rate_limited";

export type InteractiveBrokersFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: InteractiveBrokersFetchReason; message: string };

/** Reads a value from a parsed JSON body OR a classic
 * application/x-www-form-urlencoded body ("oauth_token=...&..."). IBKR's
 * Web API is documented as JSON-based generally, but the OAuth 1.0a
 * endpoints descend from the traditional OAuth 1.0a spec (which returns
 * form-encoded bodies) and Phase 0 could not confirm the exact wire
 * format without a live account (see
 * docs/integrations/interactive-brokers-phase-0.md §17, "no IBKR test/
 * sandbox credentials exist yet") — so both shapes are checked rather
 * than assuming one, the same defensive-parsing discipline
 * trading212-client.ts already uses for its own uncertain response shapes. */
function extractOAuthField(rawBody: string, field: string): string | undefined {
  try {
    const json: unknown = JSON.parse(rawBody);
    if (json && typeof json === "object" && typeof (json as Record<string, unknown>)[field] === "string") {
      return (json as Record<string, unknown>)[field] as string;
    }
  } catch {
    // not JSON — fall through to form-encoded parsing below
  }
  try {
    const params = new URLSearchParams(rawBody);
    const value = params.get(field);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

async function postOAuthEndpoint(
  path: string,
  authorizationHeader: string
): Promise<InteractiveBrokersFetchResult<string>> {
  const url = `${getInteractiveBrokersApiBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: authorizationHeader },
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    // Never include the caught error itself — see trading212-client.ts's
    // identical reasoning (could echo request details into logs).
    return { ok: false, reason: "network_error", message: "Couldn't reach Interactive Brokers" };
  }

  return classifyAndReadTextResponse(res);
}

async function classifyAndReadTextResponse(res: Response): Promise<InteractiveBrokersFetchResult<string>> {
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "unauthorized", message: "Interactive Brokers rejected this request" };
  }
  if (res.status === 429) {
    return { ok: false, reason: "rate_limited", message: "Interactive Brokers is rate-limiting this request — try again shortly" };
  }
  if (res.status >= 500) {
    return { ok: false, reason: "provider_error", message: `Interactive Brokers returned a server error (${res.status})` };
  }
  if (!res.ok) {
    return { ok: false, reason: "malformed_response", message: `Interactive Brokers returned an unexpected status (${res.status})` };
  }

  try {
    return { ok: true, data: await res.text() };
  } catch {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers returned an unreadable response" };
  }
}

/** GET, HMAC-SHA256-signed via the post-handshake authenticated request
 * signer (interactive-brokers-authenticated-request-signer.ts) — used by
 * every Phase 2 /portfolio/* call. Returns the raw response text; callers
 * parse+validate their own expected JSON shape (accounts/ledger/
 * positions each have a different shape, so there's no single generic
 * parser to share beyond the HTTP + auth plumbing here). */
async function getAuthenticatedText(
  path: string,
  args: { consumerKey: string; accessToken: string; liveSessionToken: string; realm: string }
): Promise<InteractiveBrokersFetchResult<string>> {
  const url = `${getInteractiveBrokersApiBaseUrl()}${path}`;
  const authorizationHeader = buildAuthenticatedRequestAuthorizationHeader({
    method: "GET",
    url,
    consumerKey: args.consumerKey,
    accessToken: args.accessToken,
    liveSessionToken: args.liveSessionToken,
    realm: args.realm,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: authorizationHeader, Accept: "*/*" },
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    return { ok: false, reason: "network_error", message: "Couldn't reach Interactive Brokers" };
  }
  return classifyAndReadTextResponse(res);
}

/** POST with a JSON body, HMAC-SHA256-signed the same way as
 * getAuthenticatedText — used only by /pa/transactions (Phase 3). Per
 * IBKR's own documented reference implementation for authenticated
 * requests, the JSON body is NOT part of the signature base string
 * (only method+url+oauth-params are signed, exactly as for a GET with no
 * body) — it's sent as an ordinary request payload alongside the already-
 * computed signature. */
async function postAuthenticatedJson(
  path: string,
  body: unknown,
  args: { consumerKey: string; accessToken: string; liveSessionToken: string; realm: string }
): Promise<InteractiveBrokersFetchResult<string>> {
  const url = `${getInteractiveBrokersApiBaseUrl()}${path}`;
  const authorizationHeader = buildAuthenticatedRequestAuthorizationHeader({
    method: "POST",
    url,
    consumerKey: args.consumerKey,
    accessToken: args.accessToken,
    liveSessionToken: args.liveSessionToken,
    realm: args.realm,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: authorizationHeader, Accept: "*/*", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    return { ok: false, reason: "network_error", message: "Couldn't reach Interactive Brokers" };
  }
  return classifyAndReadTextResponse(res);
}

function parseJsonBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}

export type InteractiveBrokersRequestToken = { requestToken: string };

/** Generate a Request Token — the first OAuth 1.0a step. Returns
 * `not_configured` (never throws) when IBKR_CONSUMER_KEY/
 * IBKR_RSA_PRIVATE_KEY aren't set, so the app keeps running normally
 * with the Connect button simply unable to complete until those real
 * vendor credentials exist (see interactive-brokers-config.ts). */
export async function fetchInteractiveBrokersRequestToken(): Promise<
  InteractiveBrokersFetchResult<InteractiveBrokersRequestToken>
> {
  const config = getInteractiveBrokersConfig();
  if (!config) {
    return { ok: false, reason: "not_configured", message: "Interactive Brokers integration is not configured" };
  }

  const url = `${getInteractiveBrokersApiBaseUrl()}/oauth/request_token`;
  const authorizationHeader = buildOAuthAuthorizationHeader({
    method: "POST",
    url,
    consumerKey: config.consumerKey,
    privateKeyPem: config.privateKeyPem,
  });

  const result = await postOAuthEndpoint("/oauth/request_token", authorizationHeader);
  if (!result.ok) return result;

  const requestToken = extractOAuthField(result.data, "oauth_token");
  if (!requestToken) {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers didn't return a request token" };
  }
  return { ok: true, data: { requestToken } };
}

/** The URL to send the user's browser to for the "Authorize The Consumer
 * Key" step — IBKR's own login page, on IBKR's own domain. CompassFinance
 * never sees the user's IBKR username/password at any point in this
 * redirect. */
export function getInteractiveBrokersAuthorizeUrl(requestToken: string): string {
  const url = new URL(getInteractiveBrokersAuthorizeBaseUrl());
  url.searchParams.set("oauth_token", requestToken);
  return url.toString();
}

export type InteractiveBrokersAccessToken = { accessToken: string; accessTokenSecret: string };

/** Generate Access Tokens — the final OAuth 1.0a step Phase 1 needs.
 * `requestToken` and `verifier` come from the callback's query params
 * (oauth_token, oauth_verifier), already checked against the signed state
 * cookie by the caller (see the oauth/callback route) before this is
 * ever invoked. */
export async function fetchInteractiveBrokersAccessToken(
  requestToken: string,
  verifier: string
): Promise<InteractiveBrokersFetchResult<InteractiveBrokersAccessToken>> {
  const config = getInteractiveBrokersConfig();
  if (!config) {
    return { ok: false, reason: "not_configured", message: "Interactive Brokers integration is not configured" };
  }

  const url = `${getInteractiveBrokersApiBaseUrl()}/oauth/access_token`;
  const authorizationHeader = buildOAuthAuthorizationHeader({
    method: "POST",
    url,
    consumerKey: config.consumerKey,
    privateKeyPem: config.privateKeyPem,
    token: requestToken,
    verifier,
  });

  const result = await postOAuthEndpoint("/oauth/access_token", authorizationHeader);
  if (!result.ok) return result;

  const accessToken = extractOAuthField(result.data, "oauth_token");
  const accessTokenSecret = extractOAuthField(result.data, "oauth_token_secret");
  if (!accessToken || !accessTokenSecret) {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers didn't return a complete access token" };
  }
  return { ok: true, data: { accessToken, accessTokenSecret } };
}

// ---------------------------------------------------------------------------
// Phase 2 — Live Session Token derivation and the three /portfolio/* reads.
// Verified against IBKR's own OAuth 1.0a LST documentation (see
// interactive-brokers-live-session-token.ts's header) and its /portfolio
// endpoint docs (docs/integrations/interactive-brokers-phase-0.md §6-8,
// itself sourced from ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/
// and .../accounts/). Every function below still never references
// anything under IBKR's iserver namespace — see no-iserver-access.test.ts.
// ---------------------------------------------------------------------------

export type InteractiveBrokersLiveSessionToken = { liveSessionToken: string; expiresAt: Date | null };

/** The full "Retrieve Live Session Token Signature" → "Compute the LST"
 * → "Validate the LST" sequence in one call. Returns `not_configured`
 * when Phase 2's extra config (encryption key + DH prime, see
 * getInteractiveBrokersSyncConfig) isn't set, even if Phase 1's own
 * config (consumer key + signing key) is — Phase 2 genuinely needs more
 * than Phase 1 did. A verification failure (the computed LST not
 * matching IBKR's own `live_session_token_signature`) is treated as
 * `malformed_response` — it means the derivation or IBKR's response
 * disagree, not that credentials were rejected. */
export async function fetchInteractiveBrokersLiveSessionToken(
  accessToken: string,
  accessTokenSecret: string
): Promise<InteractiveBrokersFetchResult<InteractiveBrokersLiveSessionToken>> {
  const config = getInteractiveBrokersSyncConfig();
  if (!config) {
    return { ok: false, reason: "not_configured", message: "Interactive Brokers portfolio sync is not configured" };
  }

  let prependHex: string;
  try {
    prependHex = decryptAccessTokenSecret(accessTokenSecret, config.encryptionKeyPem);
  } catch {
    // Never the raw crypto error — could in principle describe key
    // material. A decrypt failure here means the stored Access Token
    // Secret can't be decrypted with the configured encryption key
    // (wrong/rotated key, or corrupted storage) — an internal
    // configuration problem, not something Interactive Brokers did.
    return { ok: false, reason: "malformed_response", message: "Couldn't decrypt the stored Interactive Brokers credentials" };
  }

  const dhRandom = generateDhRandom();
  const dhChallenge = computeDiffieHellmanChallenge(dhRandom, getInteractiveBrokersDhGenerator(), config.dhPrime);
  const realm = getInteractiveBrokersRealm();
  const url = `${getInteractiveBrokersApiBaseUrl()}/oauth/live_session_token`;
  const authorizationHeader = buildLiveSessionTokenRequestAuthorizationHeader({
    method: "POST",
    url,
    consumerKey: config.consumerKey,
    signingKeyPem: config.privateKeyPem,
    accessToken,
    dhChallenge,
    prependHex,
    realm,
  });

  const result = await postOAuthEndpoint("/oauth/live_session_token", authorizationHeader);
  if (!result.ok) return result;

  const body = parseJsonBody(result.data) as
    | { diffie_hellman_response?: unknown; live_session_token_signature?: unknown; live_session_token_expiration?: unknown }
    | undefined;
  const dhResponseHex = typeof body?.diffie_hellman_response === "string" ? body.diffie_hellman_response : undefined;
  const lstSignatureHex =
    typeof body?.live_session_token_signature === "string" ? body.live_session_token_signature : undefined;
  if (!dhResponseHex || !lstSignatureHex) {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers didn't return a complete Live Session Token response" };
  }

  const computedLst = deriveLiveSessionToken({ dhRandom, dhResponseHex, dhPrime: config.dhPrime, prependHex });
  if (!verifyLiveSessionToken(computedLst, config.consumerKey, lstSignatureHex)) {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers's Live Session Token could not be verified" };
  }

  const expirationRaw = body?.live_session_token_expiration;
  const expiresAt =
    typeof expirationRaw === "number"
      ? new Date(expirationRaw)
      : typeof expirationRaw === "string" && expirationRaw.trim() !== "" && Number.isFinite(Number(expirationRaw))
        ? new Date(Number(expirationRaw))
        : null;

  return { ok: true, data: { liveSessionToken: computedLst, expiresAt } };
}

type AuthenticatedCredentials = { consumerKey: string; accessToken: string; liveSessionToken: string; realm: string };

/** Builds the shared credential bundle every /portfolio/* call below
 * needs — callers get this once per sync run (one LST derivation, reused
 * across account discovery + ledger + positions), never once per call. */
export function buildInteractiveBrokersAuthenticatedCredentials(
  consumerKey: string,
  accessToken: string,
  liveSessionToken: string
): AuthenticatedCredentials {
  return { consumerKey, accessToken, liveSessionToken, realm: getInteractiveBrokersRealm() };
}

export type InteractiveBrokersPortfolioAccount = {
  accountId: string;
  currency: string | null;
  type: string | null;
  clearingStatus: string | null;
  accountTitle: string | null;
  accountAlias: string | null;
};

/** GET /portfolio/accounts — the mandatory discovery call, per IBKR's own
 * docs, before ANY other /portfolio/* endpoint (see
 * docs/integrations/interactive-brokers-phase-0.md §6). Every account
 * missing a usable id is dropped rather than fabricated an id for —
 * matching "never fabricate an account ID." */
export async function fetchInteractiveBrokersPortfolioAccounts(
  credentials: AuthenticatedCredentials
): Promise<InteractiveBrokersFetchResult<InteractiveBrokersPortfolioAccount[]>> {
  const result = await getAuthenticatedText(`/portfolio/accounts`, credentials);
  if (!result.ok) return result;

  const body = parseJsonBody(result.data);
  if (!Array.isArray(body)) {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers returned an unexpected accounts shape" };
  }

  const accounts: InteractiveBrokersPortfolioAccount[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const accountId = raw.accountId ?? raw.id;
    if (typeof accountId !== "string" || accountId.length === 0) continue; // never fabricate an id
    accounts.push({
      accountId,
      currency: typeof raw.currency === "string" ? raw.currency : null,
      type: typeof raw.type === "string" ? raw.type : null,
      clearingStatus: typeof raw.clearingStatus === "string" ? raw.clearingStatus : null,
      accountTitle: typeof raw.accountTitle === "string" && raw.accountTitle.length > 0 ? raw.accountTitle : null,
      accountAlias: typeof raw.accountAlias === "string" && raw.accountAlias.length > 0 ? raw.accountAlias : null,
    });
  }
  return { ok: true, data: accounts };
}

export type InteractiveBrokersLedger = {
  currencyCode: string | null;
  netLiquidationValue: number | null;
  cashBalance: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** GET /portfolio/{accountId}/ledger — account/cash summary, per Phase
 * 0's own recommendation (§7) over the noisier, loosely-typed
 * /portfolio/{accountId}/summary. Reads the response's "BASE" entry — the
 * account's own base-currency totals, which IBKR itself computes (never
 * a conversion CompassFinance performs) — per that same section's
 * documented response shape. Buying power / margin-requirement fields
 * are NOT read here: they live only in /summary, which Phase 0 explicitly
 * deferred ("not recommended as the primary source... if needed later") —
 * see the Phase 2 doc addendum for why that stands unchanged. */
export async function fetchInteractiveBrokersAccountLedger(
  accountId: string,
  credentials: AuthenticatedCredentials
): Promise<InteractiveBrokersFetchResult<InteractiveBrokersLedger>> {
  const result = await getAuthenticatedText(`/portfolio/${encodeURIComponent(accountId)}/ledger`, credentials);
  if (!result.ok) return result;

  const body = parseJsonBody(result.data);
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers returned an unexpected ledger shape" };
  }
  const base = (body as Record<string, unknown>).BASE;
  if (!base || typeof base !== "object") {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers's ledger response had no base-currency entry" };
  }
  const b = base as Record<string, unknown>;
  return {
    ok: true,
    data: {
      currencyCode: str(b.currency),
      netLiquidationValue: num(b.netliquidationvalue),
      cashBalance: num(b.cashbalance) ?? num(b.settledcash),
      unrealizedPnl: num(b.unrealizedpnl),
      realizedPnl: num(b.realizedpnl),
    },
  };
}

export type InteractiveBrokersRawPosition = {
  conid: string;
  symbol: string | null;
  quantity: number;
  averagePrice: number | null;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  currency: string | null;
  assetClass: string | null;
  sector: string | null;
  expiry: string | null;
  strike: number | null;
  multiplier: number | null;
  underlyingConid: string | null;
};

/** GET /portfolio2/{accountId}/positions — the near-real-time positions
 * endpoint Phase 0 recommended (§8) over the older, cached
 * /portfolio/{accountId}/positions/{pageId}. Field names are read
 * defensively: IBKR's own documentation page for this exact endpoint is
 * internally inconsistent between its prose (`mktPrice`/`mktValue`) and
 * its own example response (`marketPrice`/`marketValue`) — both are
 * checked, mirroring trading212-client.ts's established "read every
 * plausible field name, never fabricate a value" discipline. Entries
 * with no conid are dropped — a position CompassFinance can't identify by
 * IBKR's own stable id is not one it can safely store (§8's own
 * "conid... not the ticker" guidance). */
export async function fetchInteractiveBrokersPositions(
  accountId: string,
  credentials: AuthenticatedCredentials
): Promise<InteractiveBrokersFetchResult<InteractiveBrokersRawPosition[]>> {
  const result = await getAuthenticatedText(`/portfolio2/${encodeURIComponent(accountId)}/positions`, credentials);
  if (!result.ok) return result;

  const body = parseJsonBody(result.data);
  if (!Array.isArray(body)) {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers returned an unexpected positions shape" };
  }

  const positions: InteractiveBrokersRawPosition[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const conidRaw = raw.conid;
    const conid = typeof conidRaw === "number" ? String(conidRaw) : typeof conidRaw === "string" ? conidRaw : null;
    const quantity = num(raw.position);
    if (!conid || quantity === null) continue;

    const undConidRaw = raw.undConid;
    const underlyingConid =
      typeof undConidRaw === "number" && undConidRaw !== 0
        ? String(undConidRaw)
        : typeof undConidRaw === "string" && undConidRaw.length > 0
          ? undConidRaw
          : null;

    positions.push({
      conid,
      symbol: str(raw.description) ?? str(raw.contractDesc),
      quantity,
      averagePrice: num(raw.avgPrice) ?? num(raw.avgCost),
      marketPrice: num(raw.marketPrice) ?? num(raw.mktPrice),
      marketValue: num(raw.marketValue) ?? num(raw.mktValue),
      unrealizedPnl: num(raw.unrealizedPnl),
      realizedPnl: num(raw.realizedPnl),
      currency: str(raw.currency),
      assetClass: str(raw.assetClass) ?? str(raw.secType),
      sector: str(raw.sector),
      expiry: str(raw.expiry),
      strike: num(raw.strike),
      multiplier: num(raw.multiplier),
      underlyingConid,
    });
  }
  return { ok: true, data: positions };
}

// ---------------------------------------------------------------------------
// Phase 3 — POST /pa/transactions ("Transaction History"), the ONE
// genuinely non-iserver, read-only source of trade/dividend/transfer
// history found during Phase 3's own research (see
// docs/integrations/interactive-brokers-phase-0.md's "Phase 3
// implementation" section). Real, documented constraints this function
// respects rather than works around:
//   - "Only supports one contract id at a time" (IBKR's own words,
//     despite `conids` being typed as an array) — this function always
//     sends exactly one.
//   - Rate-limited by IBKR to 1 request per 15 minutes GLOBALLY (verified
//     against two official pacing-limitation pages) — enforcement of
//     that cooldown lives in the sync engine (interactive-brokers-
//     sync.ts), not here; this function makes no attempt to self-throttle
//     since it has no memory of past calls.
// ---------------------------------------------------------------------------

export type InteractiveBrokersTransaction = {
  conid: number;
  /** IBKR's own company name field (`desc`) — never a ticker symbol;
   * see interactive-brokers-activity-normalizer usage for how the real
   * symbol is resolved from the caller's own already-synced position. */
  description: string | null;
  type: string;
  quantity: number;
  price: number | null;
  amount: number;
  currencyCode: string | null;
  /** ISO string — parsed here from IBKR's own documented
   * "{Day} {Mon} {DD} 00:00:00 {TZ} {Year}" format (confirmed parseable
   * by Node's Date constructor; validated below rather than assumed). */
  occurredAt: string;
};

const DEFAULT_TRANSACTIONS_LOOKBACK_DAYS = 90; // IBKR's own documented default when `days` is omitted

/** GET... actually POST /pa/transactions for exactly one conid. Returns
 * an empty list (not an error) when IBKR reports none — a real, valid
 * outcome for an instrument with no trade/dividend history in the
 * requested window, distinct from a fetch failure. Entries missing a
 * parseable date or numeric amount/quantity are dropped rather than
 * stored with a fabricated value. */
export async function fetchInteractiveBrokersTransactions(
  accountId: string,
  conid: number,
  credentials: AuthenticatedCredentials,
  days: number = DEFAULT_TRANSACTIONS_LOOKBACK_DAYS
): Promise<InteractiveBrokersFetchResult<InteractiveBrokersTransaction[]>> {
  const result = await postAuthenticatedJson(
    "/pa/transactions",
    { acctIds: [accountId], conids: [conid], currency: "USD", days },
    credentials
  );
  if (!result.ok) return result;

  const body = parseJsonBody(result.data);
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers returned an unexpected transactions shape" };
  }
  const rawList = (body as Record<string, unknown>).transactions;
  if (!Array.isArray(rawList)) {
    return { ok: false, reason: "malformed_response", message: "Interactive Brokers returned an unexpected transactions shape" };
  }

  const transactions: InteractiveBrokersTransaction[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const conidRaw = raw.conid;
    const rowConid = typeof conidRaw === "number" ? conidRaw : typeof conidRaw === "string" ? Number(conidRaw) : null;
    const quantity = num(raw.qty);
    const amount = num(raw.amt);
    const type = str(raw.type);
    const rawDate = str(raw.date);
    if (!rowConid || quantity === null || amount === null || !type || !rawDate) continue;

    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) continue; // an unparseable date can't be safely ordered or deduplicated

    transactions.push({
      conid: rowConid,
      description: str(raw.desc),
      type,
      quantity,
      price: num(raw.pr),
      amount,
      currencyCode: str(raw.cur),
      occurredAt: parsedDate.toISOString(),
    });
  }
  return { ok: true, data: transactions };
}
