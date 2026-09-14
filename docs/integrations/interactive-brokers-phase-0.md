# Interactive Brokers Integration — Phase 0

**Status:** Research complete. No code, schema, or UI changes were made in this phase.
**Scope:** Feasibility and technical specification only, for a read-only, third-party, multi-user SaaS integration with Interactive Brokers (IBKR), following the same `BrokerageConnection` pattern already used for Trading 212.

All claims below are sourced from IBKR's own current developer documentation, primarily under `https://ibkrcampus.com/docs/web-api/` (IBKR's official Web API docs, cross-linked from `interactivebrokers.com/campus`). Every non-trivial claim links to its source in the relevant section and is re-listed in [§20](#20-official-ibkr-sources).

---

## 1. Executive Summary

IBKR integration is **technically feasible for CompassFinance as a read-only, server-side, multi-user SaaS**, but it is **not a drop-in equivalent to Trading 212**. Three findings drive the whole recommendation:

1. **The only authentication method IBKR currently approves for third-party vendors like CompassFinance is OAuth 1.0a** — not OAuth 2.0, which is explicitly restricted to "licensed Organizations, Financial Advisors, and IBrokers" and unavailable to individual account structures ([§3](#3-authentication-decision)).
2. **Third-party vendor status requires a multi-week Compliance approval process with IBKR before any integration work can go live** — this is an external, non-technical blocker that gates the start of Phase 1 ([§4](#4-third-party-vendor-approval)).
3. **IBKR's live Web API has real, documented limits on historical data** (executions capped at 7 days, transaction history requiring per-instrument queries) that make it unsuitable alone for full activity sync. The **Flex Web Service**, a separate manually-configured reporting API, is the correct complementary tool for deep history — using a "paste a token" UX pattern CompassFinance already has precedent for from Trading 212 ([§10](#10-transactions--dividends--fees) and [§11](#11-synchronization-strategy)).

The Client Portal Gateway (the retail authentication method) is explicitly documented as **unsuitable for a cloud-hosted multi-user SaaS** and is rejected outright ([§5](#5-client-portal-gateway-evaluation)).

---

## 2. Official API Options

IBKR publishes several distinct API products. Only two are relevant to CompassFinance's read-only portfolio-sync use case:

| Product | Purpose | Relevant to CompassFinance? |
|---|---|---|
| **Web API** (Client Portal Web API / "IBKR Web API") | REST + WebSocket access to trading, market data, and portfolio/account data | **Yes — primary candidate** |
| **Flex Web Service** | Standalone HTTP API for generating/retrieving pre-configured historical activity reports | **Yes — for deep history** |
| TWS API | TCP-socket API (Python/Java/C++/C#) for Trader Workstation/IB Gateway | No — designed for a locally-running desktop trading terminal, not a server-side SaaS |
| Excel APIs (ActiveX/DDE/RTD) | Spreadsheet-driven trading via TWS API | No |
| FIX | Institutional order-transmission protocol | No — for order flow, not portfolio reads |
| Account Management API | Client registration/KYC/funding for Introducing Brokers and Financial Advisors who **manage** client accounts under IBKR | No — this is for firms formally onboarding clients as sub-accounts, not for a vendor reading an existing independent client's account |

Source: [IBKR API Home](https://ibkrcampus.com/docs/llms.txt), [Web API Introduction](https://ibkrcampus.com/docs/web-api/introduction.md)

IBKR is in the process of consolidating the Client Portal Web API, Digital Account Management, and Flex Web Service into one "IBKR Web API" product; existing endpoints and authentication schemes (including OAuth 1.0a) are explicitly stated as continuing to receive support, not being deprecated.

---

## 3. Authentication Decision

### A. Can CompassFinance connect users' IBKR accounts through an official API as a third-party SaaS vendor?

**Yes.** IBKR has a formal, named category for this: "third-party vendors of software that would interact with IB client accounts to which the vendor has no formal relationship." This is exactly CompassFinance's position.

Source: [Trading Access for Third Parties](https://ibkrcampus.com/docs/web-api/trading/getting-started/trading-access-for-third-parties.md)

### B. Which authentication flow is currently appropriate?

**OAuth 1.0a, Third-Party workflow.** This is stated without ambiguity:

> "Third-party vendors may currently only seek approval for the use of OAuth1.0a."

OAuth 2.0 is explicitly ruled out for our case:

> "Interactive Brokers offers an OAuth 2.0 authentication procedure for licensed Organizations, Financial Advisors, and IBrokers... **OAuth 2.0 is not available to Individual account structures.**"

Sources: [Trading Access for Third Parties](https://ibkrcampus.com/docs/web-api/trading/getting-started/trading-access-for-third-parties.md), [OAuth 2.0 Registration Process](https://ibkrcampus.com/docs/web-api/authentication/oauth-2/register.md)

One official page ([Trading Access for Organizations](https://ibkrcampus.com/docs/web-api/trading/getting-started/trading-access-for-organizations.md)) does list an OAuth 2.0 "(beta)" third-party mode, but this is presented in the context of Enterprise/Institutional client access ("contact our API Integrations team") — a different, more privileged relationship tier than the standard third-party vendor onboarding path CompassFinance falls under. See [§18](#18-open-questions).

Client Portal Gateway is a third method but is rejected for architectural reasons — see [§5](#5-client-portal-gateway-evaluation).

### C/D. Does IBKR require vendor approval, and what is the process?

**Yes, mandatory Compliance approval.** Per the official third-party onboarding page, the process is:

1. **Initial screening** by IBKR's onboarding team (~2–3 weeks). Requires an established business entity, a public presence online, and a completed website describing the product offering. A proof-of-concept build is "strongly encouraged."
2. **Compliance enhanced due-diligence review**, a three-tier approval process (~3–6 weeks).
3. **Legal agreement + technical setup**: IBKR's Legal team issues a Web API agreement for signature; in parallel, the vendor provides **public keys and a callback URL** to configure the OAuth 1.0a consumer (~3–5 weeks).

Total estimated timeline: **~8–14 weeks**, explicitly stated as variable. Registration inquiries go to `api-solutions@interactivebrokers.com`.

> "Any significant changes to the offering following approval (such as the addition of trading functionality) would require additional review and approval from our Compliance teams."

This is directly relevant: **starting as read-only now and adding trading later is explicitly anticipated by IBKR's own process, but requires a second Compliance review when it happens.**

Vendors offering *automated trading* are also expected to hold applicable financial-authority registration in every region served, unless they can provide a legal opinion explaining why not — **this does not apply to CompassFinance's read-only scope**, but will need re-evaluation if trading is added later.

Sources: [Trading Access for Third Parties](https://ibkrcampus.com/docs/web-api/trading/getting-started/trading-access-for-third-parties.md), [OAuth 1.0a Third-Party Registration Process](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/third-party-oauth/registration-process.md)

### E. What credentials/certificates must CompassFinance obtain?

- A **consumer key**, issued by IBKR only after Compliance approval.
- An **RSA keypair** — CompassFinance generates this and submits the **public key** to IBKR (used for RSA-SHA256 request signing; IBKR's docs note only `RSA-SHA256` is currently supported, not `PLAINTEXT`).
- A **registered callback URL** (an HTTPS endpoint on CompassFinance's own domain, e.g. `https://compassfinance.online/api/ibkr/oauth/callback`) that IBKR redirects the user's browser to after they authorize.
- A **Diffie-Hellman prime and generator**, supplied by IBKR during registration, used to compute the per-session Live Session Token.

Sources: [OAuth 1.0a Third-Party Registration Process](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/third-party-oauth/registration-process.md), [OAuth 1.0a Third-Party Workflow](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/third-party-oauth/third-party-o-auth-workflow.md)

### F. Can the integration be fully server-side for a multi-user SaaS?

**Yes.** OAuth 1.0a tokens authenticate requests made directly to `https://api.ibkr.com`, explicitly **"without the need for any intermediary software such as the Client Portal Gateway."** This is the opposite of the Client Portal Gateway model and is what makes a real multi-user server-side architecture possible at all.

Source: [OAuth 1.0a Introduction](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/introduction.md)

### G. Can the user authorize CompassFinance without giving CompassFinance their IBKR username/password?

**Yes.** The OAuth 1.0a third-party workflow directs the user's own browser to `https://interactivebrokers.com/authorize?oauth_token={REQUEST_TOKEN}`, where **the user logs in directly on IBKR's own site** with their own credentials. IBKR then redirects back to CompassFinance's registered callback URL with an `oauth_verifier`. CompassFinance's server never sees a username or password — only the resulting tokens.

This is architecturally identical in spirit to Trading 212's model (credentials never touch CompassFinance's frontend), but the *mechanism* differs: Trading 212 uses a static API key/secret the user generates and pastes in; IBKR uses a real OAuth redirect-based authorization dance.

Source: [OAuth 1.0a Third-Party Workflow](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/third-party-oauth/third-party-o-auth-workflow.md)

### H. Can CompassFinance request strictly read-only permissions?

**Partially confirmed, with one important nuance worth calling out.** IBKR's own marketing material states clients "can specify read-only access to third parties for additional security" (per public third-party API materials). More concretely and more importantly, the **Web API itself has a documented two-tier session model**:

1. An **outer "read-only session"**, required for any Web API request, which by itself only permits access to **non-`/iserver` endpoints** — this explicitly includes **portfolio data retrieval**.
2. A **"brokerage session"**, established via a separate `POST /iserver/auth/ssodh/init` call, required for trading, market data, and everything under `/iserver`.

Critically, the official docs for that init endpoint state:

> "This is essential for using all endpoints **besides /portfolio**."

**This means CompassFinance can read account/position/ledger data via `/portfolio/*` endpoints without ever calling the brokerage-session-initialization endpoint at all.** Never calling it means CompassFinance's integration structurally cannot place, modify, or cancel an order (those all live under `/iserver`), and — as a secondary benefit — never contends for the user's one-active-brokerage-session-per-username slot (see [§11](#11-synchronization-strategy)).

Sources: [Session Authentication](https://ibkrcampus.com/docs/web-api/authentication/sessions.md), [Trading Sessions in the Web API](https://ibkrcampus.com/docs/web-api/trading/trading-sessions-in-the-web-api.md), [Initialize Brokerage Session](https://ibkrcampus.com/docs/web-api/v1/endpoints/session/initialize-brokerage-session.md)

### I. Lifecycle of tokens

| Token | Lifetime | Renewal |
|---|---|---|
| **Access Token + Access Token Secret** | Long-lived — "only needs to be generated once, unless deleted by the user... may be cached and re-used for the lifetime of the connection." | User must re-authorize (repeat the redirect flow) only if they revoke access on IBKR's side |
| **Live Session Token (LST)** | ~24 hours, recomputed via Diffie-Hellman from the Access Token Secret | Recompute daily; no user interaction needed |
| **Read-only / brokerage session** | Idle-times-out after ~5–6 minutes without a request or a `/tickle` call; hard-resets at midnight ET/CET/HKT regardless | Re-establish per sync run; not something to keep alive continuously for a periodic sync architecture |
| **Revocation/logout** | `POST /logout` ends the current gateway-style session. The user can also revoke third-party access from their own IBKR account settings, which invalidates the Access Token. | CompassFinance should treat a subsequent auth failure as "the user revoked access" and prompt reconnection, exactly as Trading 212's `AUTHENTICATION`-category handling already does |

Sources: [Third-Party OAuth Workflow](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/third-party-oauth/third-party-o-auth-workflow.md), [Authentication FAQ](https://ibkrcampus.com/docs/web-api/authentication/faq.md), [Logout endpoint](https://ibkrcampus.com/docs/web-api/v1/endpoints/session/logout-of-the-current-session.md)

---

## 4. Third-Party Vendor Approval

Covered in detail in [§3.C/D](#cd-does-ibkr-require-vendor-approval-and-what-is-the-process). Restated as a standalone blocker list for Phase 1 planning:

- [ ] CompassFinance must have a public-facing website describing the Trading 212/Hyperliquid/IBKR integration (this already exists).
- [ ] Submit onboarding inquiry to `api-solutions@interactivebrokers.com`.
- [ ] Pass IBKR Compliance's enhanced due-diligence review (multi-week, outcome not guaranteed).
- [ ] Sign IBKR's Web API agreement (legal review needed on CompassFinance's side).
- [ ] Generate and submit an RSA keypair's public half + register a callback URL.
- [ ] Receive a live consumer key from IBKR before any code can authenticate a real user.

**No part of Phase 1 implementation can be tested against a real IBKR account until this process completes.**

---

## 5. Client Portal Gateway Evaluation

**Rejected for CompassFinance's architecture.** The official limitations are stated plainly:

> "Users must log in through the browser on the **same machine** as Client Portal Gateway in order to authenticate."
> "All API Endpoint calls must be made on the **same machine** where the Client Portal Gateway was authenticated."

Working through what this means for a cloud-hosted, multi-user SaaS:

- **A locally-running gateway is required** — a small Java process (`clientportal.gw`) that must be running and reachable for every authenticated session.
- **The IBKR user must log in on the same machine as that gateway process.** For a browser-based CompassFinance user connecting remotely, this is not satisfiable without exposing a per-user gateway process's `localhost:5000` login page to the public internet — itself a serious security anti-pattern, and still wouldn't scale.
- **One gateway instance cannot safely serve multiple users.** A gateway instance's session is tied to a single logged-in username at a time; supporting N users would mean running and lifecycle-managing N separate gateway processes (JVM instances), each independently re-authenticated (with 2FA where enabled) whenever its session times out.
- **Deployment requirements**: Java runtime, a running process per user, an authenticated login step that cannot be automated (no scripted username/password login is described for CPG — the browser-based login is the intended flow).
- **Session limitations**: same 24-hour/idle-timeout rules as OAuth-based sessions, but without OAuth's benefit of a long-lived, cacheable Access Token to skip re-authorization — every CPG session needs a fresh interactive login.

**Conclusion: CPG is designed for a single retail user running their own trading terminal, not for a backend service managing many users' credentials.** It is explicitly *not* the third-party vendor mechanism (OAuth 1.0a's own limitations page notes `/oauth` and `/oauth2` endpoints aren't even reachable through CPG at all, underscoring that CPG and OAuth are separate, non-overlapping authentication tracks).

Sources: [CPG Installation & Authentication](https://ibkrcampus.com/docs/web-api/authentication/cpgw/installation-authentication.md), [Limitations of the Client Portal Gateway](https://ibkrcampus.com/docs/web-api/authentication/cpgw/limitations-of-the-client-portal-gateway.md)

---

## 6. Account Discovery

Two distinct endpoints exist, serving different purposes — this distinction matters and should not be conflated:

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /iserver/accounts` | Accounts the user can **trade** | Requires a brokerage session (`/iserver/*`); **not needed for a read-only integration** — CompassFinance should not call this if it never initializes a brokerage session (see [§3.H](#h-can-compassfinance-request-strictly-read-only-permissions)) |
| `GET /portfolio/accounts` | Accounts the user can **view** position/account data for | The correct discovery endpoint for CompassFinance. **Must be called before any other `/portfolio/*` endpoint** — this is an explicit, documented prerequisite, not an implementation detail |

`/portfolio/accounts` response includes, per account: `accountId`, `currency` (base currency), `type` (e.g. `DEMO` for paper accounts — see [§14](#14-paper-vs-live)), `clearingStatus`, `accountTitle`/`accountAlias`, `businessType`, `ibEntity`.

**Multiple accounts**: the response is an array — a single IBKR *username* can have visibility into multiple accounts (e.g. a live account plus a linked paper account, or multiple entities). For tiered/Financial-Advisor account structures, `/portfolio/subaccounts` (up to 100) or `/portfolio/subaccounts2` (for more) must be used instead, and must also be called before other `/portfolio/*` calls for those sub-accounts.

Account identifiers (`accountId`, e.g. `"U1234567"`) are IBKR's own stable account numbers — the correct primary key for `BrokerageConnection.externalAccountId`-equivalent storage, directly analogous to Trading 212's own account `id`.

Sources: [Receive Brokerage Accounts](https://ibkrcampus.com/docs/web-api/v1/endpoints/accounts/receive-brokerage-accounts.md), [Querying Your Accounts](https://ibkrcampus.com/docs/web-api/trading/portfolio-and-positions/querying-your-accounts.md), [Portfolio Accounts reference](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/portfolio-accounts.md)

---

## 7. Account Data

The best-documented, most usable source for account-level cash/net-liquidation data is **`GET /portfolio/{accountId}/ledger`**, not the sprawling `/portfolio/{accountId}/summary` endpoint (which returns "a total of 45–135 unique values" in a loosely-typed key/value structure — usable, but far noisier).

`/portfolio/{accountId}/ledger` returns one object per currency the account holds (plus a synthetic `"BASE"` key for the account's base-currency totals) with:

- `netliquidationvalue` — net liquidation value
- `cashbalance` / `settledcash` — cash and settled cash
- `stockmarketvalue`, `futuremarketvalue`, and similar per-asset-class market-value breakdowns
- `unrealizedpnl` / `realizedpnl`
- `interest` — margin interest rate
- `exchangerate` — FX rate from base currency to this currency (relevant to [§12](#12-asset-identification-and-mapping) and native-currency display, matching CompassFinance's existing "never fabricate a converted number" rule)

`/portfolio/{accountId}/summary` remains available if buying-power/margin-requirement-specific fields are needed later (it separates "-c" commodity and "-s" security sub-values within the same key namespace), but is not recommended as the primary source given its size and the fact IBKR's own docs describe its schema only loosely.

Sources: [Portfolio Ledger](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/portfolio-ledger.md), [Portfolio Summary](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/portfolio-summary.md), [Querying Equity and Margin](https://ibkrcampus.com/docs/web-api/trading/portfolio-and-positions/querying-equity-and-margin.md)

---

## 8. Positions

Two position endpoints exist with a genuine cached-vs-real-time distinction, as the task asked to verify:

| Endpoint | Behavior |
|---|---|
| `GET /portfolio/{accountId}/positions/{pageId}` | **Cached.** Paginated, 100 positions per page (`pageId` starting at 0). A `POST /portfolio/{accountId}/positions/invalidate` endpoint exists specifically to force-refresh this cache. |
| `GET /portfolio2/{accountId}/positions` | **Near-real-time**, explicitly documented as removing "caching otherwise found in the /portfolio/{accountId}/positions/{pageId} endpoint." Not paginated in the same way; returns a `timestamp` (epoch) per response. |

**Recommendation:** use `/portfolio2/{accountId}/positions` for sync — it is the fresher, purpose-built source, and CompassFinance's own sync model already favors real per-sync snapshots over stale caches (mirrors why Trading 212's own position sync always fetches fresh rather than trusting any local cache).

Fields available across both endpoints (union), mapped to CompassFinance's normalization needs:

| CompassFinance concept | IBKR field |
|---|---|
| Raw ticker/symbol | `contractDesc` (v1) / `description` (v2) |
| Stable identifier | **`conid`** (see [§12](#12-asset-identification-and-mapping) — this is the one to key on, not the ticker) |
| Security type / asset class | `assetClass` (STK, OPT, FUT, ...), also `secType` on v2 |
| Quantity | `position` |
| Average cost / average price | `avgCost`, `avgPrice` (distinct: `avgCost` already includes the contract multiplier) |
| Market price / market value | `mktPrice` / `mktValue` (v1) or `marketPrice` / `marketValue` (v2) |
| Unrealized / realized P&L | `unrealizedPnl`, `realizedPnl` |
| Currency | `currency` |
| Sector / industry group | `sector`, `group` |
| Expiry (derivatives) | `expiry` |
| Strike / put-call (options) | `strike`, `putOrCall` |
| Multiplier | `multiplier` |
| Underlying | `undConid` (the underlying instrument's own conid) |

Every one of these is a field IBKR itself returns — nothing here is inferred or invented.

Sources: [Positions](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/positions.md), [Positions (NEW)](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/positions-new.md), [Invalidate Backend Portfolio Cache](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/invalidate-backend-portfolio-cache.md)

---

## 9. Orders and Executions

This is the section with the most significant real limitation for a Trading-212-style "full history" expectation.

- **`GET /iserver/account/trades`** — executions for **the current day plus the six previous days only** (a 7-day rolling window). It lives under `/iserver`, meaning it **requires a full brokerage session** (see [§3.H](#h-can-compassfinance-request-strictly-read-only-permissions)) — a real trade-off, since using it would mean giving up the "never touch `/iserver`" simplicity that keeps the integration structurally incapable of trading. The docs also advise calling it "once per session," implying it is not meant for frequent polling.
- **Live/working orders** (`/iserver/account/orders`, `/iserver/account/trades`) are similarly `/iserver`-gated and reflect current-day activity, not historical order lifecycle records the way Trading 212's `/equity/history/orders` does.

**There is no live Web API endpoint that returns a user's complete historical order/execution record beyond ~7 days.** For anything older, the Flex Web Service ([§10](#10-transactions--dividends--fees)) is IBKR's own documented tool.

**Order vs. execution distinction**: the `/iserver/account/trades` response already represents a *fill* (it has `execution_id`, `price`, `size`, `commission`, `net_amount`) — it is execution-shaped, not order-lifecycle-shaped the way Trading 212's `BrokerageOrder` (which carries both requested and filled quantities in one record) is. IBKR's Flex "Trade Confirmation" reports are similarly execution-level. **If deeper order-lifecycle state (partial fills over time, cancellations) is ever needed, that would require the `/iserver` trading endpoints and their required brokerage session** — an explicit trade-off to make consciously, not by default.

Source: [Trades](https://ibkrcampus.com/docs/web-api/v1/endpoints/order-monitoring/trades.md)

---

## 10. Transactions / Dividends / Fees

**`POST /pa/transactions`** covers dividend payments, buy/sell transactions, and transfers, but with real constraints:

- Requires an explicit `acctIds` + `conids` array in the request body. The docs state plainly: **"Only supports one contract id at a time"** despite the field being typed as an array — a documented quirk, not an assumption on our part.
- Defaults to 90 days of history if `days` is omitted; no evidence of a mechanism to request "everything since the account was opened" in one call.
- Rate-limited to **1 request per 15 minutes** — extremely restrictive, and explicitly incompatible with "call this once per conid" for any portfolio with more than a handful of holdings.

**Conclusion: `/pa/transactions` is not a viable bulk historical-activity sync source.** There is no unified "give me all my transactions" live endpoint analogous to Trading 212's `/history/transactions` or `/history/dividends`.

### The Flex Web Service is the correct tool for this data

The Flex Web Service is IBKR's dedicated reporting API, and it is explicitly designed for exactly this use case — arbitrary-date-range historical statements including trades, dividends, deposits/withdrawals, fees, and (via appropriate Flex Query sections) corporate actions.

However, it has a real, structural limitation worth stating plainly: **it cannot be configured by CompassFinance on the user's behalf.** The flow is:

1. The user must **manually log into their own IBKR Client Portal**, navigate to Reporting → Flex Queries, and enable the Flex Web Service.
2. The user **manually creates a Flex Query template** (choosing sections/fields/date range) and obtains a **Query ID**.
3. The user **manually generates a Flex Web Service Access Token** (configurable to last 6 hours to 1 year, with optional IP restriction).
4. Only then can CompassFinance call:
   - `GET .../FlexWebService/SendRequest?t={Token}&q={QueryID}&v=3` to trigger report generation (rate-limited to **1 req/sec, max 10 req/min**), which returns a `ReferenceCode`.
   - `GET .../FlexWebService/GetStatement?t={Token}&q={ReferenceCode}&v=3` to retrieve the generated report (plain-text/XML).

This is a genuinely manual, per-user setup step — but it maps directly onto a UX pattern CompassFinance already has proven with Trading 212: the user generates a credential (API key/secret for Trading 212; Flex token + Query ID for IBKR) inside the broker's own portal and pastes it into CompassFinance's Connect modal. **The same `BrokerageConnection`-style "paste your credential" flow is directly reusable here**, just with two pasted values instead of one, and it should be presented as a *second, optional* connection step ("Enable full history") layered on top of the OAuth-based live-position connection, not a blocker to connecting at all.

Sources: [Flex Web Service Introduction](https://ibkrcampus.com/docs/web-api/flex-web-service/introduction.md), [Enable and Create Access Token](https://ibkrcampus.com/docs/web-api/flex-web-service/client-portal-configuration/enable-and-create-access-token.md), [Create a Flex Query](https://ibkrcampus.com/docs/web-api/flex-web-service/client-portal-configuration/create-a-flex-query.md), [Generate a Report](https://ibkrcampus.com/docs/web-api/flex-web-service/using-flex-web-service/generate-the-report.md), [Retrieve the Report](https://ibkrcampus.com/docs/web-api/flex-web-service/using-flex-web-service/retrieve-the-report.md)

---

## 11. Synchronization Strategy

### Polling vs. streaming

Polling is supported and is the natural fit for CompassFinance's existing scheduler (`trading212-scheduler.ts`'s bounded-concurrency, locked, per-connection model). A WebSocket alternative exists (`/v1/api/ws`) for live/streaming account and market-data updates, but it implies holding an open, continuously-maintained connection per user — a materially different (and heavier) operational model than the existing periodic-sync architecture, and not necessary for a portfolio snapshot that only needs to be reasonably fresh, not real-time.

### Session lifetime and what happens on expiry

- The Access Token/Secret is long-lived and reusable; only the daily-recomputed Live Session Token and the short-idle-timeout read-only/brokerage session need periodic renewal.
- A session times out after ~5–6 minutes of inactivity (`/tickle` resets this, recommended every ~1 minute) and unconditionally resets at midnight ET/CET/HKT.
- **For a periodic sync (not a continuously-open session), CompassFinance does not need to tickle between runs at all** — a fresh Live Session Token can simply be (re-)computed at the start of each sync attempt from the already-stored Access Token Secret, used for the handful of requests that sync needs, and then left to expire naturally. This fits the existing "one sync attempt = one bounded unit of work" model exactly.
- On authentication failure (revoked access token, Compliance-required re-auth), the existing `AUTHENTICATION` error category and `status: "ERROR"` connection-flagging logic already built for Trading 212 in `trading212-sync.ts`/`trading212-error-classification.ts` applies without modification — the classification is provider-neutral, only the *detection* of which HTTP response means "auth failed" is provider-specific.

### Rate limits and the existing scheduler

Two official pacing-limits pages give **different global figures** (one states a 50 req/s global ceiling per session with CPG restricted to 10 req/s; a second, older-looking page states a flat 10 req/s global ceiling) — this inconsistency should be verified with IBKR support before Phase 1 rather than assumed. What both agree on, and what matters most for our design:

| Endpoint | Limit |
|---|---|
| `/portfolio/accounts`, `/portfolio/subaccounts` | 1 request / 5 seconds |
| `/pa/transactions`, `/pa/summary`, `/pa/performance` | 1 request / 15 minutes |
| `/tickle` | 1 request / second |
| Flex `SendRequest` | 1 req/sec, max 10 req/min |

A per-connection sync run (account discovery → ledger → positions) comfortably fits within these limits. The existing scheduler's bounded concurrency (`getTrading212MaxConcurrentSyncs`) and per-connection atomic lock (`acquireSyncLock`) are directly reusable as-is — see [§15](#15-compatibility-with-brokerageconnection).

### Incremental sync and snapshot vs. append-only data

- **Positions and account/ledger data are snapshots** — same "replace wholesale, never diff" model already used for `BrokeragePosition`/`BrokerageAccount`.
- **There is no reliable `updatedAt`/cursor mechanism for incremental activity sync via the live Web API** (`/pa/transactions` has no cursor, just a `days` lookback window; `/iserver/account/trades` has no cursor either, just a fixed 7-day window). Incremental sync of activity is realistically only achievable via the Flex Web Service, using `fd`/`td` (from-date/to-date) parameters to request only the window since the last successful Flex report — genuinely append-only, matching `BrokerageOrder`/`BrokerageTransaction`/`BrokerageActivity`'s existing idempotent-upsert design.

---

## 12. Asset Identification and Mapping

IBKR identifies every instrument by a numeric **`conid`** (contract ID) — a stable, IBKR-internal identifier that does not change for the life of the contract, independent of ticker/exchange/currency changes. Every position and trade record carries it.

**Recommendation: map by `conid`, never by ticker symbol alone.** Reasons, directly from the documented fields:

- The same company can list on multiple exchanges/currencies with different tickers; `conid` is unambiguous where a ticker is not.
- `undConid` (the underlying's own conid) is present for derivatives, giving a clean, non-string-parsing way to resolve "AAPL 2026 $200 Call" back to its underlying stock — something a ticker string alone cannot do reliably.
- This mirrors CompassFinance's own existing philosophy for Trading 212 (map by the provider's stable identifier when possible, fall back to raw ticker + name for anything unmapped, never guess) — `trading212-asset-mapping.ts`'s ticker-stripping approach was a reasonable fit for Trading 212's `AAPL_US_EQ`-style tickers specifically because Trading 212 doesn't expose conid-equivalent stable IDs; IBKR does, and CompassFinance should prefer it.

Practical mapping strategy for a future Phase 1: maintain a small `conid → CompassFinance AssetId` table (analogous to `trading212-asset-mapping.ts`'s ticker table) for the ~13 assets in CompassFinance's catalog, populated once by looking up each catalog asset's real IBKR conid via IBKR's contract-search endpoints (`/trsv/secdef`, `/iserver/secdef/search`) at implementation time — never inferred or guessed at runtime. Anything without a known conid mapping stays unmapped and displays its raw `contractDesc`/company name, exactly as the Trading 212 integration already does for unmapped instruments.

Sources: [Positions](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/positions.md), [Contract IDs](https://ibkrcampus.com/docs/web-api/trading/instrument-discovery/contract-i-ds.md)

---

## 13. Security Model

- **Secrets to store per connection**: OAuth Access Token + Access Token Secret (the long-lived pair). These are the IBKR analogue of Trading 212's API Key/Secret and should be encrypted at rest using the exact same AES-256-GCM scheme already implemented in `src/server/security/encryption.ts` — no new crypto primitive is needed.
- **Private keys/certificates**: CompassFinance must generate and safeguard an **RSA private key** (the public half goes to IBKR at onboarding, once, per consumer key — not per user). This is infrastructure-level (one keypair for the whole app, like a TLS cert), not a per-user secret, and should live in the server environment (e.g. alongside `CREDENTIALS_ENCRYPTION_KEY`), never in the database.
- **Token rotation**: the Access Token/Secret pair is rotated only if the user revokes and re-authorizes; the Live Session Token is recomputed daily as a matter of course (not a "rotation" event requiring any alerting).
- **Revocation**: user-initiated, from their own IBKR account settings; CompassFinance detects this the same way it detects any `AUTHENTICATION`-category failure today.
- **Logging restrictions**: never log the Access Token Secret, RSA private key, or any computed Live Session Token/OAuth signature — directly analogous to the existing "never log the Authorization header" rule in `trading212-client.ts`.
- **Never sent to the frontend**: Access Token Secret, RSA private key, Live Session Token, OAuth signatures — all of it, always server-side only, exactly mirroring `getDecryptedTrading212Credentials`'s `"server-only"` boundary today.
- **Never exposed to the Compass Agent**: the Agent must only ever see the same normalized, already-synced `Brokerage*` read models Trading 212 exposes it — never raw IBKR tokens, never a live IBKR API handle it could use to act.
- **Can access tokens be used to trade?** Yes, in principle — the same Access Token that permits `/portfolio/*` reads could, in the hands of a different call, be used against `/iserver` trading endpoints, **because IBKR's OAuth scope is not fine-grained per-endpoint**. CompassFinance's read-only guarantee for this integration is therefore an **application-level discipline, not an IBKR-enforced technical restriction**: our own server code must simply never call any `/iserver` trading/order endpoint. This is a materially different guarantee than Trading 212's, where the connected API key can be scoped read-only by Trading 212 itself. This should be called out explicitly to the user in-product (e.g. "CompassFinance's IBKR integration only ever reads your account — trading is not implemented" rather than "your connection is read-only by IBKR's own restriction").
- **How to guarantee read-only in practice**: never call `/iserver/auth/ssodh/init` (which structurally prevents ever reaching any `/iserver` trading endpoint, since they require that session) — this is a strong, enforceable-in-code guarantee, not just a policy statement, and should be treated as a hard architectural rule in Phase 1 (e.g. a lint/test guardrail similar to the existing `no-private-key-exposure.test.ts` pattern, asserting the IBKR client module never references `/iserver`).

---

## 14. Paper vs. Live

- **Paper accounts can be connected.** They authenticate with a **separate, dedicated paper username** — not a mode flag on the live account. Per the docs: "unlike other parts of Interactive Brokers, there is no slider to indicate a live or Paper account login... customers must use their specific Paper username to authenticate." The paper username/password can be found and reset from Client Portal settings.
- **Same API/authentication flow?** Yes — the OAuth 1.0a third-party flow is identical; the user simply authorizes using their paper username instead of their live one during the redirect step. This effectively means a paper connection and a live connection are **two separate OAuth authorizations** (two separate Access Token pairs), exactly as CompassFinance's `BrokerageConnection` model already treats Trading 212 vs Hyperliquid vs (future) IBKR as independent connections — a paper IBKR connection is simply a third *kind* of "account" under the same provider, not a flag.
- **`/portfolio/accounts`' `type` field** reflects this — the earlier example response literally shows `"type": "DEMO"` for a paper account, giving a clean, real signal to detect and label a connection as paper vs. live without guessing.
- **Does third-party approval apply to both?** The onboarding/Compliance process is about approving CompassFinance as a vendor and is not paper/live-specific; once approved, both paper and live users can authorize through the same consumer key.
- **Limitations of paper accounts**: the underlying **live** account must still be "fully open and funded" and of the IBKR Pro account type for its associated paper account to be usable via the Web API at all — a paper-only account with no funded live counterpart is not sufficient. Demo/paper accounts also cannot subscribe to live market data (irrelevant to CompassFinance's read-only portfolio-sync scope, but worth noting for completeness).

**CompassFinance must keep this paper IBKR connection completely separate from CompassFinance's own internal Paper Trading feature.** An IBKR paper account is still a *real* IBKR account structure with its own conids/positions/ledger — it must be labeled "IBKR (Paper)" or similar and never merged into CompassFinance's simulated Paper Trading portfolio, consistent with the Portfolio page's existing hard separation between Paper Trading and every real brokerage/wallet source.

Sources: [Using a Paper Account](https://ibkrcampus.com/docs/web-api/authentication/paper.md), [Trading Access for Individuals](https://ibkrcampus.com/docs/web-api/trading/getting-started/trading-access-for-individuals.md), [Querying Your Accounts](https://ibkrcampus.com/docs/web-api/trading/portfolio-and-positions/querying-your-accounts.md)

---

## 15. Compatibility with BrokerageConnection

Reviewed against the existing Trading 212 implementation (`brokerage-provider.ts`, `trading212-repository.ts`, `trading212-sync.ts`, `trading212-scheduler.ts`, `trading212-error-classification.ts`) without changing any of it.

### Directly reusable as-is

- **`BrokerageProvider` interface shape** — `getAccountSummary`/`getPositions`/history-page getters generalize cleanly; an `IbkrProvider` would implement the same interface.
- **The sync engine's per-step, continue-on-failure structure** (`runSteps` in `trading212-sync.ts`) — account/positions/orders/dividends/transactions as independent steps with per-step success/failure/skip reporting is provider-neutral already.
- **The atomic per-connection lock** (`acquireSyncLock`'s compare-and-swap on `syncStatus`/`syncStartedAt`) — entirely provider-agnostic; works identically for an IBKR connection row.
- **The scheduler** (`trading212-scheduler.ts`'s eligibility query + bounded concurrency) — would need only a `provider: "ibkr"` filter added alongside the existing `provider: "trading212"` one, or a small generalization to loop over configured providers.
- **`Trading212ErrorCategory`** (`AUTHENTICATION | PERMISSION | RATE_LIMIT | NETWORK | PROVIDER_ERROR | INVALID_RESPONSE | INTERNAL`) — already provider-neutral in name and intent; only the classification function mapping raw HTTP responses to categories needs an IBKR-specific implementation.
- **`BrokerageAccount` / `BrokeragePosition` / `BrokerageOrder` / `BrokerageTransaction` / `BrokerageActivity` models** — the `(userId, brokerageConnectionId, provider, externalId)` shape already accommodates a second provider's rows without any schema change; `externalId` would simply hold IBKR's `conid`-qualified identifiers instead of Trading 212's ticker-based ones.
- **Encryption utility** (`encryption.ts`) — reusable for the new secret fields.

### Requires provider-specific behavior (new code, not new abstractions)

- **OAuth redirect flow**: Trading 212's connect flow is a single "paste key + secret" form-submit; IBKR's is a three-legged OAuth redirect (request token → user redirect to IBKR → callback with verifier → access token exchange). This needs a new `/api/user/ibkr/oauth/*` route pair (start + callback), which Trading 212's single-route connect flow has no equivalent of.
- **Live Session Token computation**: a genuinely new piece of logic (Diffie-Hellman key exchange + HMAC-SHA256 signing), not needed for Trading 212's flat API-key model.
- **RSA request signing**: every authenticated IBKR request needs an OAuth 1.0a signature computed with CompassFinance's RSA private key — no equivalent in the Trading 212 client at all.
- **Account discovery as a mandatory pre-step**: Trading 212 has no analogous "list accounts before you can read them" call; IBKR's `/portfolio/accounts` must be called and its result stored/consulted before any position/ledger read.
- **Explicit non-use of `/iserver`**: a new, IBKR-specific guardrail (see [§13](#13-security-model)) with no Trading 212 equivalent, since Trading 212 has no comparable "escalate to trading" surface reachable from the same credentials.

### Can `BrokerageConnection` support IBKR's needs?

| Need | Current schema support | Verdict |
|---|---|---|
| OAuth token pair storage | `encryptedApiKey`/`encryptedApiSecret` fields already exist and are generically named (not Trading-212-specific) | **Reusable as-is** — store Access Token in `encryptedApiKey`, Access Token Secret in `encryptedApiSecret` |
| Provider-specific token metadata (DH prime/generator reference, consumer key version) | No dedicated field | **Would need a new nullable JSON/text column**, e.g. `providerMetadata`, generic enough for any future provider's odd extra fields — not IBKR-specific schema bloat |
| Account discovery / multiple IBKR accounts per connection | `BrokerageConnection` today models one connection = one `externalAccountId` | **Would need either**: (a) one `BrokerageConnection` row per discovered IBKR account (simplest, most consistent with today's 1:1 model, works if a user connects each IBKR account separately), or (b) a new child table for "discovered accounts under one OAuth connection" if IBKR access should be authorized once and cover multiple accounts transparently. Recommend (a) for Phase 1 simplicity, revisit only if real users commonly have multiple IBKR accounts under one login. |
| Session/LST expiration state | No dedicated field | **Reuse `syncStartedAt`-style pattern**: LST can be recomputed on demand from the stored Access Token Secret without persisting the LST itself at all (it's cheap to recompute, and NOT persisting it is safer) |
| Paper vs. live distinction | `status`/`provider` fields exist but no "environment" concept | **Would need a new field** (e.g. `environment: "live" | "paper"`), since — unlike Trading 212's `TRADING212_ENVIRONMENT` env-level toggle — paper vs. live is a **per-connection, per-user** choice for IBKR, not a global server setting |

**No schema changes were made in this phase** — the above are documented requirements for Phase 1, not implemented.

---

## 16. Required Future Schema Changes

For Phase 1 planning only — **not implemented in Phase 0**:

1. `BrokerageConnection.providerMetadata` (nullable JSON/text) — for provider-specific extras (IBKR: nothing sensitive, just non-secret config like the DH prime/generator reference IBKR issued at registration).
2. `BrokerageConnection.environment` (`"live" | "paper"`, default `"live"`) — needed because IBKR's paper/live split is per-connection, unlike Trading 212's global env var.
3. Confirm/decide the one-connection-per-IBKR-account vs. one-connection-covers-multiple-accounts question from [§15](#15-compatibility-with-brokerageconnection) before writing the migration — this affects whether any new table is needed at all, or whether the existing `(userId, provider)` uniqueness constraint needs loosening to `(userId, provider, externalAccountId)` to allow multiple simultaneous IBKR connections per user.
4. No changes needed to `BrokerageAccount`/`BrokeragePosition`/`BrokerageOrder`/`BrokerageTransaction`/`BrokerageActivity` — their existing shape already accommodates IBKR's fields (conid fits naturally where Trading 212's ticker currently goes, as an additional/alternate identifier column if we want to preserve both raw ticker and conid — likely `BrokeragePosition.externalId` becomes the conid directly, with a new optional `rawSymbol` column to keep the human-readable ticker too, mirroring Trading 212's existing `externalTicker`).

---

## 17. Blockers

1. **IBKR Compliance approval** — cannot be started, tested, or worked around technically; ~8–14 week estimated external process, outcome not guaranteed.
2. **RSA keypair generation + submission**, and receipt of a live consumer key from IBKR — both happen only after approval, per IBKR's own stated sequencing.
3. **A completed, public-facing description of the IBKR integration on CompassFinance's own website** — an explicit Compliance review expectation, not optional.
4. **No IBKR test/sandbox credentials exist yet** to validate any of the above against a real account — all details in this document come from reading documentation, not from a live integration test (the task explicitly scoped Phase 0 to research only).
5. **The pacing-limit discrepancy** between IBKR's two official pacing-limitation pages ([§11](#11-synchronization-strategy)) should be clarified with IBKR support before finalizing scheduler concurrency settings for IBKR specifically.

---

## 18. Open Questions

1. **Is the OAuth 2.0 "(beta)" third-party mode mentioned under "Trading Access for Organizations" ever reachable by a standard third-party vendor like CompassFinance**, or is it strictly reserved for Enterprise/Institutional relationships contacted directly through IBKR's API Integrations team? The two official pages are not fully reconciled on this point ([§3.B](#b-which-authentication-flow-is-currently-appropriate)).
2. **Does a `/portfolio/*` read genuinely never require any prior `/iserver/auth/ssodh/init` call in practice**, or does the OAuth 1.0a third-party workflow's own description ("after generating a Live Session Token, users must initialize the session to begin retrieving market data, submitting orders, **or analyzing account information**") mean brokerage-session initialization is still commonly needed to unlock `/portfolio/*` reads in real usage, despite the separate Session Authentication page's explicit "read-only session... permits access to... portfolio data" and the init endpoint's own "essential for using all endpoints besides /portfolio" wording? These two authoritative-seeming statements are in tension and should be verified empirically once sandbox/approved access exists, before committing to the "never touch /iserver" architectural guarantee in [§13](#13-security-model) as load-bearing.
3. **Exact global rate limit** — 50 req/s or 10 req/s per session (two official pages disagree; see [§11](#11-synchronization-strategy)).
4. **Whether one OAuth authorization can cover multiple IBKR accounts under one user transparently**, or whether each account effectively needs its own connection/authorization — affects the schema decision in [§16](#16-required-future-schema-changes) item 3.
5. **Whether IBKR's third-party Compliance approval, once granted, is a one-time gate or requires periodic re-certification** — not addressed in the pages reviewed.
6. **Current, exact wording of the read-only permission a user grants during the OAuth authorize step** — public third-party marketing material mentions "read-only access" as an option, but the technical OAuth 1.0a docs reviewed here don't show a `scope` parameter; this should be confirmed once test/sandbox access exists.

---

## 19. Recommended Phase 1 Architecture

**Authentication method:** OAuth 1.0a, Third-Party workflow.
**Authorization flow:** Standard OAuth 1.0a request-token → user-redirect-to-IBKR → callback-with-verifier → access-token exchange, exactly as documented in [§3](#3-authentication-decision).
**Server-side architecture:** Fully server-side, no Client Portal Gateway, no per-user local process — matches the existing Next.js API-route model (`/api/user/ibkr/*` mirroring `/api/user/trading212/*`).
**Token storage:** Access Token + Access Token Secret, AES-256-GCM encrypted via the existing `encryption.ts`, in `BrokerageConnection.encryptedApiKey`/`encryptedApiSecret`. Live Session Token computed on-demand per sync run, never persisted.
**Account discovery:** `GET /portfolio/accounts` (and `/portfolio/subaccounts` for FA/tiered structures) called once per sync run before any other portfolio read, per IBKR's documented requirement.
**Portfolio endpoints:** `/portfolio2/{accountId}/positions` (near-real-time) for positions; `/portfolio/{accountId}/ledger` for account/cash summary.
**Activity endpoints:** Flex Web Service (user-provided token + Query ID, à la Trading 212's API key/secret) for full historical trades/dividends/fees/transfers; `/pa/transactions` not used as a primary sync source given its per-conid/15-minute-rate-limit constraints.
**Synchronization strategy:** periodic polling via the existing scheduler infrastructure, one sync run = one fresh LST computation + a handful of `/portfolio/*` calls, no persistent tickling between runs, no use of `/iserver` at all (hard read-only guarantee).
**Read-only security model:** enforced in code by never calling `/iserver/auth/ssodh/init` or any `/iserver` endpoint — a structural guarantee, not just a stated policy — backed by a guardrail test analogous to `no-private-key-exposure.test.ts`.

**Exact sequence for Phase 1 onward (not implemented in this phase):**

1. Submit third-party onboarding inquiry to IBKR (`api-solutions@interactivebrokers.com`) and await Compliance approval — the actual Phase 1 code cannot be validated against a real account until this completes, but the code itself does not need to wait if IBKR provides any earlier sandbox access (unconfirmed — see [§18](#18-open-questions)).
2. Generate CompassFinance's RSA keypair; store the private key alongside existing infra secrets; submit the public key once IBKR requests it.
3. Register the OAuth callback URL and receive the consumer key + DH prime/generator from IBKR.
4. Add the schema changes identified in [§16](#16-required-future-schema-changes) (new migration, following the same review process as the four Trading 212 migrations already shipped).
5. Implement `ibkr-client.ts` (raw HTTP + OAuth 1.0a signing + LST computation) mirroring `trading212-client.ts`'s structure.
6. Implement `ibkr-provider.ts` against the existing `BrokerageProvider` interface.
7. Implement the OAuth start/callback routes (`/api/user/ibkr/oauth/start`, `/api/user/ibkr/oauth/callback`).
8. Implement `ibkr-asset-mapping.ts` (conid → CompassFinance `AssetId`), seeded manually per [§12](#12-asset-identification-and-mapping).
9. Extend the sync engine/scheduler to include the `ibkr` provider (largely configuration, given [§15](#15-compatibility-with-brokerageconnection)'s reuse findings).
10. Implement the Flex Web Service "paste your token + Query ID" secondary connection step for historical activity.
11. Add the `/iserver`-avoidance guardrail test before writing any client code that could accidentally reach it.
12. UI: extend the existing Real Portfolios section (Portfolio page) and Connected Accounts page with an IBKR card, following the exact same not-connected/connected/compact/expanded pattern already built for Trading 212 and Hyperliquid.
13. Comprehensive tests mirroring the existing Trading 212 test suite's structure (sync engine, error classification, activity normalization, IDOR guardrails).
14. Full verification pass (`tsc`, `test`, `lint`, `build`) before any deploy.

---

## 20. Official IBKR Sources

- [IBKR API Home](https://ibkrcampus.com/docs/llms.txt)
- [Web API Introduction](https://ibkrcampus.com/docs/web-api/introduction.md)
- [Session Authentication](https://ibkrcampus.com/docs/web-api/authentication/sessions.md)
- [Managing Multiple Sessions](https://ibkrcampus.com/docs/web-api/authentication/multiple-sessions.md)
- [Using a Paper Account](https://ibkrcampus.com/docs/web-api/authentication/paper.md)
- [Authentication Frequently Asked Questions](https://ibkrcampus.com/docs/web-api/authentication/faq.md)
- [Client Portal Gateway — Installation & Authentication](https://ibkrcampus.com/docs/web-api/authentication/cpgw/installation-authentication.md)
- [Client Portal Gateway — Limitations](https://ibkrcampus.com/docs/web-api/authentication/cpgw/limitations-of-the-client-portal-gateway.md)
- [OAuth 1.0a Introduction](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/introduction.md)
- [OAuth 1.0a Request Structure](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/request-requirements.md)
- [OAuth 1.0a Third-Party Registration Process](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/third-party-oauth/registration-process.md)
- [OAuth 1.0a Third-Party Workflow](https://ibkrcampus.com/docs/web-api/authentication/oauth-1a/third-party-oauth/third-party-o-auth-workflow.md)
- [OAuth 2.0 Introduction](https://ibkrcampus.com/docs/web-api/authentication/oauth-2/introduction.md)
- [OAuth 2.0 Registration Process](https://ibkrcampus.com/docs/web-api/authentication/oauth-2/register.md)
- [Trading Access for Third Parties](https://ibkrcampus.com/docs/web-api/trading/getting-started/trading-access-for-third-parties.md)
- [Trading Access for Individuals](https://ibkrcampus.com/docs/web-api/trading/getting-started/trading-access-for-individuals.md)
- [Trading Access for Organizations](https://ibkrcampus.com/docs/web-api/trading/getting-started/trading-access-for-organizations.md)
- [Trading Sessions in the Web API](https://ibkrcampus.com/docs/web-api/trading/trading-sessions-in-the-web-api.md)
- [Querying Your Accounts](https://ibkrcampus.com/docs/web-api/trading/portfolio-and-positions/querying-your-accounts.md)
- [Querying Equity and Margin](https://ibkrcampus.com/docs/web-api/trading/portfolio-and-positions/querying-equity-and-margin.md)
- [Receive Brokerage Accounts](https://ibkrcampus.com/docs/web-api/v1/endpoints/accounts/receive-brokerage-accounts.md)
- [Portfolio Accounts](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/portfolio-accounts.md)
- [Positions](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/positions.md)
- [Positions (NEW)](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/positions-new.md)
- [Invalidate Backend Portfolio Cache](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/invalidate-backend-portfolio-cache.md)
- [Portfolio Summary](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/portfolio-summary.md)
- [Portfolio Ledger](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio/portfolio-ledger.md)
- [Trades](https://ibkrcampus.com/docs/web-api/v1/endpoints/order-monitoring/trades.md)
- [Transaction History](https://ibkrcampus.com/docs/web-api/v1/endpoints/portfolio-analyst/transaction-history.md)
- [Flex Web Service Introduction](https://ibkrcampus.com/docs/web-api/flex-web-service/introduction.md)
- [Flex Web Service — Enable and Create Access Token](https://ibkrcampus.com/docs/web-api/flex-web-service/client-portal-configuration/enable-and-create-access-token.md)
- [Flex Web Service — Create a Flex Query](https://ibkrcampus.com/docs/web-api/flex-web-service/client-portal-configuration/create-a-flex-query.md)
- [Flex Web Service — Generate a Report](https://ibkrcampus.com/docs/web-api/flex-web-service/using-flex-web-service/generate-the-report.md)
- [Flex Web Service — Retrieve the Report](https://ibkrcampus.com/docs/web-api/flex-web-service/using-flex-web-service/retrieve-the-report.md)
- [Pacing Limitations (Trading docs)](https://ibkrcampus.com/docs/web-api/trading/usage-and-availability/pacing-limitations.md)
- [Pacing Limitations (v1 docs)](https://ibkrcampus.com/docs/web-api/v1/pacing-limitations.md)
- [Requirements & Limitations Introduction](https://ibkrcampus.com/docs/web-api/v1/requirements-limitations/introduction.md)
- [Initialize Brokerage Session](https://ibkrcampus.com/docs/web-api/v1/endpoints/session/initialize-brokerage-session.md)
- [Logout of the current session](https://ibkrcampus.com/docs/web-api/v1/endpoints/session/logout-of-the-current-session.md)
- [Contract IDs](https://ibkrcampus.com/docs/web-api/trading/instrument-discovery/contract-i-ds.md)

---

## 21. Phase 1 Implementation

**Status:** Connection lifecycle implemented (connect → OAuth → store → show connected → disconnect). No portfolio/positions/orders/transactions/dividends sync — that remains entirely out of scope, per this phase's own explicit limits. None of Phase 0's conclusions above needed revision; nothing built here contradicted them.

### What was built

- **Schema**: one migration, `interactive_brokers_nullable_account_id` — `BrokerageConnection.externalAccountId` is now nullable. This is the only schema change; §16's other suggested fields (`providerMetadata`, `environment`) were deliberately NOT added, since nothing in Phase 1 needs them yet (they'd be unused columns) — see the field's own updated comment in `prisma/schema.prisma`.
- **OAuth 1.0a Third-Party signing** (`src/server/interactive-brokers/interactive-brokers-oauth-signer.ts`): a from-scratch, standards-based implementation of RFC 5849's signature-base-string construction and RSA-SHA256 signing, using only Node's built-in `crypto` — no new dependency. Confirmed against the two real endpoint paths named in [§3](#3-authentication-decision) (`POST /v1/api/oauth/request_token`, `POST /v1/api/oauth/access_token`) by re-fetching IBKR's own Third-Party OAuth Workflow page directly (not from memory) during implementation.
- **Client** (`src/server/interactive-brokers/interactive-brokers-client.ts`): the two calls above, plus `getInteractiveBrokersAuthorizeUrl()` for the `https://interactivebrokers.com/authorize?oauth_token=...` redirect. Response parsing is defensive — it accepts either a JSON or classic form-encoded body — because Phase 0 could not confirm the exact wire format for these two endpoints without a live account (still true; see [§17](#17-blockers)).
- **Config** (`src/server/interactive-brokers/interactive-brokers-config.ts`): reads `IBKR_CONSUMER_KEY` and `IBKR_RSA_PRIVATE_KEY` and returns `null` (never throws) when either is absent — every caller treats that as "not configured yet" and fails the specific request cleanly. No Diffie-Hellman prime/generator env var was added: Phase 1 never computes a Live Session Token, so nothing would read it.
- **CSRF/state protection** (`src/server/interactive-brokers/interactive-brokers-oauth-state.ts`): a short-lived (10 minute), HttpOnly, Secure-in-production, `SameSite=Lax`, HMAC-SHA256-signed cookie correlating the "start" and "callback" steps — reuses `AUTH_SECRET` rather than a new secret. Chosen over a new "pending OAuth request" database table as the smaller change, per this phase's own instruction to keep the schema change minimal.
- **Repository** (`src/server/repositories/interactive-brokers-repository.ts`): mirrors `trading212-repository.ts`'s shape (DTO/connect/disconnect/decrypt), adapted for OAuth — `completeInteractiveBrokersOAuthConnection(userId, accessToken, accessTokenSecret)` replaces Trading 212's `validateCredentials`-then-store flow, called only from the callback route after a real, successful token exchange. `provider = "INTERACTIVE_BROKERS"`. `externalAccountId` is left `null` (Phase 1 never calls `/portfolio/accounts`); no sync-metadata field is ever written.
- **Routes** (`src/app/api/user/interactive-brokers/`): `GET`/`DELETE` on the base route (status/disconnect, mirroring Trading 212's route exactly), plus `oauth/start` (redirects to IBKR) and `oauth/callback` (verifies the state cookie, exchanges the verifier, upserts the connection, redirects back into the app with `?ibkr=connected` or `?ibkr=error&reason=...`). Every route calls `requireUserId()`; the callback route additionally checks the CURRENT session against the userId recorded in the state cookie at start time, rejecting a mismatch — this is the concrete mechanism preventing one user's callback from attaching to another user's account.
- **UI** (`src/components/profile/interactive-brokers-card.tsx`): added to Profile → Connected Accounts, following Trading212Card's not-connected/connected layout exactly. Connect is a real `<a href>` navigation to `oauth/start` (not a form/modal) — IBKR's own login page is where the user authenticates. No sync button, no portfolio panel — there is nothing to sync yet.
- **Read-only guarantee, enforced in code, not just policy**: `no-iserver-access.test.ts` scans every file in `src/server/interactive-brokers/` and the three new API routes for any reference to IBKR's `iserver` endpoint namespace and fails if one is ever added — the concrete implementation of [§13](#13-security-model)'s architectural (not protocol-level) read-only guarantee.

### Environment variables

Two new server-side-only variables, neither ever `NEXT_PUBLIC_*`: `IBKR_CONSUMER_KEY` and `IBKR_RSA_PRIVATE_KEY` (PEM, with real newlines escaped as `\n`). Documented with generation instructions directly in `.env.local` next to Trading 212's own `CREDENTIALS_ENCRYPTION_KEY` entry — this repository has no tracked `.env.example` file for any of its existing variables (checked directly: none exists, despite the README's setup instructions referencing one), so this follows the same real precedent already established for Trading 212 rather than introducing a new, inconsistent documentation location. Both are commented out and left unset; the app builds and runs normally without them (verified) — the Connect button simply cannot complete the OAuth handshake until real values exist.

### Tests

Added: `interactive-brokers-oauth-signer.test.ts` (percent-encoding, base-string construction, and — using a freshly generated real RSA keypair — a full signature verification round-trip against `crypto.createVerify`, proving the signature actually validates rather than merely "looking like" one), `interactive-brokers-oauth-state.test.ts` (round-trip, tamper/wrong-secret/expiry rejection), `interactive-brokers-client.test.ts` (not-configured handling, request/response shape, error classification, `/iserver` absence), `interactive-brokers-repository.test.ts` (mirrors `trading212-repository.test.ts`'s structure: encryption, cross-user isolation, no fabricated sync metadata, other providers' rows left untouched), route tests for all three routes (auth requirement, the full OAuth error-reason matrix, and — the specific security requirement — a test asserting a callback whose session user differs from the cookie's recorded user is rejected before any connection is created), and `no-iserver-access.test.ts`. Full existing suite (Trading 212, Hyperliquid, everything else) re-run and passing alongside these — 1252 tests total, no regressions.

### Verification

`tsc --noEmit`, `npm test` (1252/1252 passing), `npm run lint`, and `npm run build` all pass cleanly with no IBKR credentials configured in the environment — confirming the app never crashes or fails to build due to their absence. Live-verified against a running dev server (unauthenticated): `oauth/start` redirects to `/signin`; `oauth/callback` with a missing verifier redirects to `?ibkr=error&reason=denied`; the base route 401s. The Connected Accounts page renders the new card successfully. The actual OAuth handshake against a real IBKR account could not be tested — no consumer key or RSA credentials exist (see [§17](#17-blockers), unchanged) — exactly the blocker Phase 0 already identified.

---

## 22. Phase 2 Implementation

**Status:** Initial read-only portfolio sync implemented (account discovery → account selection → account data → positions → normalization → CompassFinance portfolio). Activity/history (orders, executions, trades, transactions, dividends, fees, deposits, withdrawals, Flex Web Service) is explicitly out of scope for this phase, per its own instructions, and was not touched. None of Phase 0's conclusions needed revision; one genuinely new finding surfaced during implementation (the Live Session Token requirement, below) that Phase 0 had deliberately deferred rather than researched in depth.

### A new finding beyond Phase 0/1: the Live Session Token is mandatory for every /portfolio/* call

Phase 0 flagged Diffie-Hellman/Live Session Token (LST) computation as "a genuinely new piece of logic... not needed for Trading 212's flat API-key model" but didn't research it in depth, since Phase 1's scope (connect/disconnect only) never called a data endpoint at all. Implementing Phase 2 required going all the way through IBKR's own OAuth 1.0a documentation for this step, which surfaced two things Phase 0 could not have known without doing so:

1. **No `/portfolio/*` call can be made with just the Access Token** — every one of them requires an LST, computed via a real Diffie-Hellman key exchange (a `POST /oauth/live_session_token` request, RSA-signed) plus an HMAC-SHA1 derivation and a mandatory verification step against a signature IBKR itself returns. Only once verified does it become usable to HMAC-SHA256-sign the actual `/portfolio/accounts`, `/portfolio/{accountId}/ledger`, and `/portfolio2/{accountId}/positions` calls — a full, separate signing scheme from the RSA-SHA256 used throughout the OAuth handshake itself.
2. **IBKR's LST derivation requires a SECOND, distinct RSA keypair** ("encryption key") from the one used for OAuth request signing ("signature key") — used only to PKCS#1 v1.5-decrypt the Access Token Secret, never for signing. This means CompassFinance's real IBKR onboarding will need to generate and submit **two** RSA public keys, not one, plus the Diffie-Hellman prime IBKR issues per consumer key (the generator is fixed at 2 and is not configurable).

Every detail above (endpoint paths, exact algorithm, byte-encoding edge cases like sign-bit padding) was verified directly against IBKR's own current documentation during implementation (`ibkrcampus.com/docs/web-api/authentication/oauth-1a/lst/...` and `.../authenticated-requests.md`) — nothing was invented or guessed. See `src/server/interactive-brokers/interactive-brokers-live-session-token.ts` and `interactive-brokers-authenticated-request-signer.ts` for the implementation, and their test files for a full simulated two-party Diffie-Hellman round trip proving the derivation is self-consistent.

One more real-world wrinkle: Node.js refuses `RSA_PKCS1_PADDING` for private decryption by default (CVE-2023-46809 hardening), but IBKR's protocol fixes PKCS#1 v1.5 as the Access Token Secret's encryption scheme — not something CompassFinance can substitute. The Access Token Secret is decrypted via raw (`RSA_NO_PADDING`) RSA followed by manual, RFC 8017-compliant unpadding instead; this is safe here specifically because the value being decrypted is CompassFinance's own Access Token Secret, received once from IBKR over the already-authenticated exchange — never a value a remote party can resubmit many times to build a padding-oracle attack, which is the actual threat model that Node's hardening protects against.

### Account discovery and selection

`GET /portfolio/accounts` is always called before any other `/portfolio/*` endpoint, exactly as `/portfolio/accounts` documents as a hard prerequisite — confirmed directly against its own reference page during implementation, along with `/portfolio/{accountId}/ledger` and `/portfolio2/{accountId}/positions`'s exact field names (see `interactive-brokers-client.ts`'s own header comments for the literal field lists this implementation reads).

Selection logic (`interactive-brokers-account-selection.ts`, pure and directly unit-tested):

- **Zero accounts** → sync fails with a clear message; nothing is persisted.
- **Exactly one account** → auto-selected, no user input needed.
- **A previously-selected account still present among the newly-discovered accounts** → re-selected as-is, even if new accounts have since appeared — a re-sync never re-prompts unnecessarily.
- **Multiple accounts with no still-valid prior selection** (first sync with >1 account, or the previously-selected account disappeared and >1 remain) → the sync returns `needs_account_selection` with the full candidate list; nothing is guessed by array order. The Portfolio page's Interactive Brokers panel shows a minimal chooser (radio list + "Use this account"), which calls `POST /api/user/interactive-brokers/select-account`. That route never trusts the submitted account id outright — it re-runs discovery itself and only persists the choice if it's genuinely among IBKR's currently-reported accounts for that user's own connection.

`BrokerageConnection.externalAccountId` (made nullable in Phase 1 for exactly this reason) is populated with the real, discovered IBKR account id once selection resolves — never a fabricated value, and never a second connection row.

### Account and position data mapping

**Account** (`GET /portfolio/{accountId}/ledger`, read via the response's `"BASE"` entry — the account's own base-currency totals, which IBKR itself computes, never a conversion CompassFinance performs): `netliquidationvalue` → `totalValue`, `cashbalance` (falling back to `settledcash`) → `cashAvailable`, `unrealizedpnl`/`realizedpnl` map directly. `investedValue` is derived as `totalValue - cashAvailable` (a real accounting identity from two real reported numbers — not a guess) rather than summing IBKR's per-asset-class market-value fields, which would UNDERSTATE the true figure for any asset class this integration doesn't enumerate. `cashInPies`/`cashReserved` have no IBKR equivalent and are always `null` for IBKR rows. **Buying power and margin-related values are NOT synchronized in Phase 2**: the chosen endpoint (`/portfolio/{accountId}/ledger`, per this doc's own §7 recommendation) doesn't return them — only the noisier, loosely-typed `/portfolio/{accountId}/summary` does, which §7 already explicitly deferred ("not recommended as the primary source... if needed later"). Revisit only if a future phase specifically needs those fields.

**Positions** (`GET /portfolio2/{accountId}/positions`, the near-real-time endpoint per §8's own recommendation over the older cached one): every field IBKR documents is read defensively, checking both name variants where IBKR's own documentation page is internally inconsistent between its prose and its own example JSON (`mktPrice`/`mktValue` vs `marketPrice`/`marketValue` — both exist in the same official doc page). `conid` (never the ticker) is the primary key, stored in `BrokeragePosition.externalId`. New, provider-neutral nullable columns were added to the existing `BrokeragePosition` model (never a second model): `realizedPnl`, `assetClass`, `sector`, `expiry`, `strike`, `multiplier`, `underlyingConid` — always `null` for Trading 212 rows, populated for IBKR exactly where IBKR itself reports a value and left `null` otherwise (never a substituted zero).

### Asset mapping

Per the requirement's own priority order (conid → secType/exchange/currency → ticker/symbol): only priority 3 is actually reachable today, since CompassFinance's asset catalog has no conid registry at all (same limitation Trading 212's own ticker-based mapping already has). `interactive-brokers-asset-mapping.ts`'s function signature still accepts conid/assetClass/currency so a future phase can add a real conid table without an API change. The one safety rule Trading 212 never needed: a symbol match is attempted **only** when `assetClass` is exactly `"STK"` — options, futures, and other derivatives frequently share a root symbol with an unrelated underlying stock (an AAPL option's own description often starts with "AAPL"), so every non-STK position is left deliberately unmapped rather than risking a collision with the wrong Compass asset.

### Sync semantics

`interactive-brokers-sync.ts` follows `trading212-sync.ts`'s established shape as closely as IBKR's protocol allows, reusing its atomic sync lock outright (`acquireSyncLock` was extracted to `src/server/brokerage/sync-lock.ts` specifically so both providers share one lock implementation, not two) and its exact sync-metadata semantics (`syncStatus`/`syncStartedAt`/`lastSyncAt`/`lastFailedSyncAt`, `status` flips to `ERROR` only for a credential-invalidating failure category). One structural difference: Trading 212's account/positions/orders/dividends/transactions steps are each independently callable with the same flat API key, so one failing doesn't block the others; IBKR's LST derivation and account discovery are a genuine shared PREREQUISITE for every subsequent call, so a failure there fails both the account and positions steps identically rather than attempting either. A failure at any point never deletes previously-synced `BrokerageAccount`/`BrokeragePosition` rows — the positions step's own delete only ever removes positions IBKR no longer reports on a *successful* fetch, never all of them because of an unrelated error. Manual sync only (`POST /api/user/interactive-brokers/sync`, mirroring Trading 212's own manual-sync button) — no scheduler/cron integration, per this phase's own "do not invent a new UX unless required" instruction.

### Error handling

Reuses Trading 212's error-classification vocabulary and logic wholesale (`interactive-brokers-error-classification.ts` maps IBKR's own fetch-reason shape onto the exact same `AUTHENTICATION`/`PERMISSION`/`RATE_LIMIT`/`NETWORK`/`PROVIDER_ERROR`/`INVALID_RESPONSE`/`INTERNAL` categories, adding only `not_configured → INTERNAL` for IBKR's own "nothing to talk to yet" case) rather than a second category system. Covers: authentication failure, expired/invalid OAuth token, account discovery failure, no accounts returned, unsupported/multiple accounts, portfolio/positions endpoint failure, rate limiting, timeout, network failure, malformed response (including the DH/LST derivation and verification steps failing), encryption/decryption failure, and database failure (an unclassified thrown error, e.g. a Prisma error, is caught and reduced to the same generic `INTERNAL`-classified message Trading 212 already uses for that case).

### Known IBKR limitations (Phase 2-specific)

- The exact wire format of `POST /oauth/live_session_token`'s and the two OAuth handshake endpoints' responses could not be confirmed against a live account (same blocker as Phase 1) — parsing is defensive (JSON primary, form-encoded fallback for the handshake steps).
- `/portfolio/{accountId}/summary`'s buying-power/margin fields remain unimplemented, per this doc's own §7 recommendation, restated above.
- No live IBKR account exists to verify the actual byte-for-byte correctness of the DH/LST derivation against IBKR's real server — the implementation is verified as internally self-consistent (a full simulated two-party exchange round-trips correctly in `interactive-brokers-live-session-token.test.ts`) and follows IBKR's documented reference implementation exactly, but genuine interoperability can only be confirmed once real credentials exist.

### Tests

Added: `interactive-brokers-live-session-token.test.ts` (modular exponentiation correctness and DH commutativity, PKCS#1 v1.5 decrypt round-trip via a real keypair, sign-bit padding regression cases, a full simulated two-party DH exchange proving both "sides" derive the identical LST, and LST-signature verification accept/reject), `interactive-brokers-authenticated-request-signer.test.ts`, `interactive-brokers-account-selection.test.ts` (every branch of the selection decision table, including the security-critical "never silently pick by array order" case), `interactive-brokers-asset-mapping.test.ts` (including the STK-only collision guard), extended `interactive-brokers-client.test.ts` (LST derive/verify against a simulated server, all three `/portfolio/*` fetchers, defensive field-name parsing, rate-limit classification), `interactive-brokers-sync.test.ts` (locking, account selection branches, account/position field mapping, snapshot replace-not-append semantics, failure paths never destroying valid data, needs-attention classification), extended route tests for the three new routes (`portfolio`, `sync`, `select-account` — including select-account's own re-validation-against-fresh-discovery security test), and an extended `no-iserver-access.test.ts` covering every new file. Full existing suite re-run and passing alongside these — 1365 tests total, no regressions (Trading 212's own test suite, including `trading212-sync.test.ts`, still passes unchanged after `acquireSyncLock`'s extraction into the shared lock module).

### Verification

`tsc --noEmit`, `npm test` (1365/1365 passing), `npm run lint`, and `npm run build` all pass cleanly with no IBKR credentials configured — confirming the app never crashes or fails to build due to their absence, same guarantee as Phase 1. Live-verified against a running dev server (unauthenticated): the portfolio/sync/select-account routes all 401; the Portfolio page renders its new "IBKR" tab and panel successfully. The actual sync flow against a real IBKR account could not be tested — no consumer key, RSA credentials (either keypair), or DH prime exist yet (see [§17](#17-blockers), unchanged) — exactly the blocker Phase 0 already identified, now additionally covering the second (encryption) RSA keypair this phase's research surfaced as also required.

### Explicit scope boundary

Per this phase's own instructions, the following remain entirely unimplemented and untouched: orders, executions, trades history, transactions, dividends, fees, deposits, withdrawals, the Flex Web Service, any trading/order-placement endpoint, and market-data streaming. No `/iserver` endpoint was introduced (enforced by the extended `no-iserver-access.test.ts` guardrail). Trading 212 and Hyperliquid's own sync/UI code were not modified beyond the one shared-lock extraction described above, which is behavior-preserving and covered by their own still-passing test suites.

---

## 23. Phase 3 Implementation

**Status:** Read-only activity/history sync implemented for the ONE genuinely viable live endpoint found — see the research below. Orders in the true order-lifecycle sense (limit/stop price, cancellation, live status), fees/commissions, and deposits/withdrawals are NOT implemented, because no live, non-`/iserver`, non-Flex endpoint provides them — this is a real, researched limitation, not an oversight, and is documented in detail below rather than papered over. None of Phase 0/1/2's conclusions needed revision; this phase's own research reconfirmed §9/§10's findings rather than contradicting them.

### Research: re-verified, not assumed

Re-fetched directly from IBKR's own current documentation during this phase (not relied on from memory or Phase 0's summary alone):

- **`GET /iserver/account/orders`** ("Live Orders") — `/iserver`-gated, requires a pre-flight `/iserver/account` call, capped at 1000 orders, day-of orders only. **Forbidden by this integration's own hard rule** (see §13/§21) — never called.
- **`GET /iserver/account/trades`** ("Trades") — `/iserver`-gated, current day + 6 previous days only, "advised to call...once per session." **Forbidden** — never called.
- **`POST /pa/transactions`** ("Transaction History") — the ONE endpoint outside `/iserver` this research could find for trade/dividend/transfer history. Real, confirmed constraints:
  - Requires `acctIds` (array) + `conids` (array, but **"only supports one contract id at a time,"** IBKR's own words) + `currency` + optional `days` (defaults to 90).
  - **Rate-limited by IBKR to 1 request per 15 minutes, GLOBALLY** — re-confirmed directly against BOTH of IBKR's own pacing-limitation pages (`/web-api/trading/usage-and-availability/pacing-limitations` and `/web-api/v1/pacing-limitations`), which agree exactly on this figure (no discrepancy this time, unlike the general rate limit Phase 0 flagged as inconsistent in §11).
  - Response shape (fetched and read directly, not assumed): `{ transactions: [{ date, cur, fxRate, pr, qty, acctid, amt, conid, type, desc }, ...], ... }`. **No id or reference field of any kind** for an individual transaction row.
  - The one documented example shows `type: "Sell"` (a completed trade). IBKR's own endpoint description also claims "dividend payments... transfers" are covered, but **no worked example exists for either** — the exact `type` string(s) IBKR would send for those categories is genuinely unconfirmed and is called out explicitly below and in code comments, never guessed at as if confirmed.

**Conclusion, stated plainly: there is no live, non-`/iserver` Web API source for order-lifecycle data, fees/commissions, or deposits/withdrawals at all.** `/pa/transactions`'s "Buy"/"Sell" rows are execution-shaped facts (symbol, side, quantity, price, date, amount) with no order id, order type, limit/stop price, or cancellation state — this is why Phase 3 stores them as already-filled `BrokerageOrder` rows (see below), never as pending/live orders.

### Orders / Executions / Trades

Per the research above, "orders" in the order-lifecycle sense (submitted → partially filled → cancelled, etc.) **cannot be synced at all** without `/iserver`, which is forbidden. What Phase 3 actually implements: `/pa/transactions`' "Buy"/"Sell" rows are stored as `BrokerageOrder` rows that are **always already fully filled** (`status: "FILLED"`, `quantity === filledQuantity`) — reusing `normalizeOrderRow` (the SAME function Trading 212 uses) completely unchanged for the read side, since an always-fully-filled row naturally takes that function's existing "execution only, no order view" branch with zero new logic. No separate "Trade" or "Fill" record is created — per this phase's own explicit instruction against showing "Execution / Trade / Fill" as three rows for one event, IBKR's data is stored and shown as exactly one row per transaction.

### Transactions / Deposits / Withdrawals

**Not implemented — a real, documented limitation, not an oversight.** `/pa/transactions` is fundamentally an per-instrument report (both its request, which requires a specific conid, and its response, where every row carries a conid) — it cannot represent a pure cash deposit or withdrawal, which has no associated instrument at all. No other live, non-Flex endpoint was found that could. `BrokerageTransaction` is therefore **never populated for provider = INTERACTIVE_BROKERS** — the activity repository's "fees"/"deposits"/"withdrawals" filters always return an empty (not erroring) page for IBKR, an honest reflection of what the Web API can provide.

### Dividends

Any `/pa/transactions` row whose `type` ISN'T recognizably "Buy"/"Sell" (case-insensitive) is stored as a `BrokerageActivity` row with IBKR's raw `type` string preserved verbatim. At READ time, `normalizeInteractiveBrokersActivityRow` shows it as a dividend only when that raw type string literally contains "divid" (case-insensitive) — the one category IBKR's own endpoint description explicitly names, so recognizing it is asserted with real confidence; every other raw type is shown as the same honest "transfer" catch-all Trading 212's own `mapTransactionKind` uses, with the original string always visible for diagnostics. **Withholding/gross-vs-net tax information is not available** — `/pa/transactions` reports one `amt` figure per row with no separate tax/withholding field in its documented schema.

### Fees

**Not implemented.** The only endpoint that reports a `commission` field at all is `/iserver/account/trades` — `/iserver`-gated and forbidden. `/pa/transactions`'s documented schema has no fee/commission field. There is therefore no live source for IBKR commissions or fees in this integration; this is stated explicitly rather than silently shown as "$0 in fees."

### Normalization strategy

Storage-side (raw API row → DB fields) and display-side (DB row → UI item) stay the two separate concerns this codebase already keeps distinct for Trading 212 (`trading212-sync.ts`'s inline upserts vs. `activity-normalizer.ts`'s read-side functions) — Phase 3 follows the same split:
- **Storage**: `interactive-brokers-sync.ts`'s new activity step classifies each raw row (`isInteractiveBrokersTradeType`, `interactive-brokers-activity.ts`) and upserts into `BrokerageOrder` or `BrokerageActivity` directly — no shared "normalizer" call needed here, matching Trading 212's own `upsertOrders`/`upsertDividends` precedent exactly.
- **Display**: `activity-normalizer.ts` (moved from `lib/trading212/` to the provider-neutral `lib/portfolio/` specifically for this reuse) gained `normalizeInteractiveBrokersActivityRow` for the `BrokerageActivity` case, and `normalizeOrderRow` was parametrized with an explicit `provider` argument (`PortfolioSource`, required — not defaulted) so Interactive Brokers' own `BrokerageOrder` rows reuse the exact same function Trading 212 uses, with zero IBKR-specific branching added to it.

### Asset mapping

Reused unchanged from Phase 2 (`interactive-brokers-asset-mapping.ts`) — the sync step resolves an activity row's `compassAssetId`/`externalTicker` from the **already-synced `BrokeragePosition`** for that same conid (found via the position step that always runs immediately before the activity step in the same sync pass), rather than re-deriving it from `/pa/transactions`' own `desc` field (a company name, e.g. "Apple Inc" — never a ticker, and not run through the STK-only collision guard a second time). This is a deliberate reuse of Phase 2's own mapping decision, not a second mapping pass.

### Idempotency

`/pa/transactions` provides **no unique id for any row at all** (confirmed directly against its documented schema — see the research section above). `buildInteractiveBrokersTransactionExternalId` (`interactive-brokers-activity.ts`) constructs a deterministic composite key from five real, stable fields IBKR itself reported: `conid`, the exact ISO-parsed date, signed quantity, price, and amount — e.g. `ibkr-txn:265598:2023-12-11T05:00:00.000Z:-5:192.26:961.3`. Never a timestamp alone, never a random UUID. Running the activity step twice against identical IBKR data reproduces the identical key both times, so `BrokerageOrder`/`BrokerageActivity`'s existing `@@unique([brokerageConnectionId, externalId])` constraint upserts onto the same row rather than duplicating — verified directly in `interactive-brokers-sync.test.ts`'s "running twice creates no duplicate" test. **Documented, accepted edge case**: two genuinely distinct real-world transactions on the same conid, same day, same quantity, same price, AND same amount would collide onto the same key — the identical accepted risk Trading 212's own dividend fallback-id scheme already carries for the same underlying reason (the provider gives nothing more specific to key on).

### Pagination strategy

`/pa/transactions` itself takes no pagination parameters at all (a bounded `days`-based lookback window is the only knob — see below) — there is nothing for the IBKR provider layer to hide from the rest of the app on the FETCH side. On the READ side (serving the Portfolio page's activity list), `interactive-brokers-activity-repository.ts` reuses the exact same cursor-pagination scheme `trading212-activity-repository.ts` already established (an opaque, base64url-encoded `{before: <ISO timestamp>}` cursor, scoped to the caller's own userId+connection) — no second pagination implementation.

### Incremental sync / rate-limit enforcement

`/pa/transactions`' own 1-request-per-15-minutes GLOBAL rate limit (not per-conid — the whole endpoint) makes true "sync everything on every run" architecturally impossible without risking IBKR throttling the connection. Phase 3's design, in the sync engine (`interactive-brokers-sync.ts`):
- A new `BrokerageConnection.lastActivitySyncAt` field (the one schema change this phase required — see below) enforces the cooldown across process restarts and repeated manual "Sync" clicks, mirroring `lastSyncAt`'s own existing pattern but tracking a genuinely separate clock (account/positions sync must still work every time the user clicks Sync; only the activity step needs its own 15-minute gate).
- Each real attempt (success OR failure) updates the cooldown clock; a **skip** (cooldown still active, or the account holds no positions) does not, since no request was actually sent to IBKR.
- **Only ONE position's activity is fetched per sync run** — the position whose stringified conid sorts first, a deterministic (not random, not "most recent") choice. **This is a real, deliberate limitation, not a bug**: a portfolio with several holdings will only ever see this one position's activity synced until it's sold, since covering N positions would require N × 15 minutes minimum. A round-robin rotation across positions was considered and deliberately NOT built — the added complexity isn't clearly justified given the endpoint's own severe rate limit already makes "complete history" unreachable regardless of rotation strategy; this is called out here explicitly rather than silently shipped as if it covered the whole portfolio.
- The activity step's own outcome (`success` / `failed` / `skipped`) **never affects the overall sync's `synced`/`failed` status** — account+positions succeeding is already a fully successful sync in the Phase 2 sense, and "skipped this run" is the ROUTINE case for the one rate-limited data source, not a degraded sync. A failed activity attempt never erases previously-synced `BrokerageOrder`/`BrokerageActivity` rows (nothing in the activity step ever deletes; every write is an upsert).

### Historical limitations (summary)

| Data | Available live (non-`/iserver`, non-Flex)? | Limitation |
|---|---|---|
| Orders (lifecycle: limit price, status, cancellation) | **No** | Only `/iserver/account/orders` exposes this — forbidden |
| Executions/fills (as trade facts: side, qty, price, date) | **Yes, partial** | Via `/pa/transactions`, ONE conid per 15 minutes, 90-day default lookback |
| Dividends | **Yes, partial, unconfirmed exact type string** | Same endpoint/limits as above; IBKR's own docs show no worked dividend example |
| Deposits/Withdrawals | **No** | `/pa/transactions` is conid-scoped; no live endpoint represents account-level cash movements |
| Fees/commissions | **No** | Only `/iserver/account/trades`'s `commission` field — forbidden; `/pa/transactions` has no fee field |

### Flex Web Service — deliberately not implemented, isolated as a future option

Per this phase's own instruction ("should NOT be implemented automatically... unless the official API limitations make a required feature impossible without it"): the limitations above are real, but nothing in Phase 3's acceptance criteria was "impossible without Flex" — a genuine (if narrow) live activity source exists. Flex therefore remains exactly what Phase 0 already scoped it as (§10): a **future, optional, user-configured second connection step** ("Enable full history," pasting a Flex Query Token + Query ID the user generates in their own IBKR portal) that would fill the gaps above (complete order history, deposits/withdrawals, fees, unlimited lookback) without replacing the OAuth-based live-position connection. Not started in this phase.

### UI behavior

`InteractiveBrokersAccountPanel`'s expanded view gained an activity section identical in shape to `Trading212AccountPanel`'s own (same `ActivityList` component, same `Trading212ActivityFilterBar` reused as-is with `includeAccountLevel={false}` since fees/deposits/withdrawals are always empty for IBKR) — no separate "IBKR Activity" page was created. The asset-detail page gained an analogous "Your Interactive Brokers history" card, fully independent of Trading 212's own equivalent card (a held asset can show real history from both sources at once, never merged into one list — Milestone 18's explicit requirement). `ActivityList` itself was generalized from `Trading212ActivityList` (moved to `components/portfolio/activity-list.tsx`) to take an explicit `sourceLabel`/`emptyLabel` prop rather than a hardcoded "Trading 212" string, which would otherwise have mislabeled every IBKR row.

### Schema change

One migration: `BrokerageConnection.lastActivitySyncAt` (nullable `DateTime`) — the ONLY schema change this phase required, for the rate-limit cooldown reasoning above. `BrokerageOrder`/`BrokerageTransaction`/`BrokerageActivity` needed no changes at all — their existing shape (already generic since Trading 212 built them) was sufficient to represent everything IBKR's one viable endpoint provides. Trading 212 and Hyperliquid compatibility preserved: `lastActivitySyncAt` stays `null` for every non-IBKR row, and no other column's meaning changed.

### Security / read-only

No `/iserver` reference exists anywhere in the codebase (enforced by the extended `no-iserver-access.test.ts`, now covering every Phase 3 file too). The IBKR client gained exactly one new method (`fetchInteractiveBrokersTransactions`) — a read (POST, per IBKR's own API design for this specific endpoint, but a query, never a mutation) — no trading, order-placement, or account-modification method exists anywhere in the provider layer. Credentials and the Live Session Token remain server-only, encrypted at rest, never returned to the frontend, never logged, never reachable by the Compass Agent (unchanged from Phase 1/2).

### Tests

Added: `interactive-brokers-activity.test.ts` (idempotency-key determinism and collision-avoidance across the five stable fields, Buy/Sell type recognition), extended `interactive-brokers-client.test.ts` (`/pa/transactions` request shape, defensive date parsing, empty-window handling, rate-limit classification, `/iserver`-absence), extended `activity-normalizer.test.ts` (`normalizeOrderRow`'s new `provider` parameter reused for IBKR, `normalizeInteractiveBrokersActivityRow`'s dividend-recognition and transfer-fallback branches), extended `interactive-brokers-sync-config.test.ts` (the cooldown floor can never be configured below IBKR's own documented 15-minute limit), extensively extended `interactive-brokers-sync.test.ts` (cooldown skip, no-positions skip, successful Buy/Sell → `BrokerageOrder` and dividend/other → `BrokerageActivity` storage, deterministic conid selection across multiple positions, idempotency across two full sync runs, activity failure never flipping the overall sync status, `lastActivitySyncAt` updated on a real attempt but never on a skip), a new `interactive-brokers-activity-repository.test.ts` (every `kind` filter including the always-empty fees/deposits/withdrawals case, cross-user isolation, cursor pagination), a new activity route test, and extended `no-iserver-access.test.ts`. Full existing suite re-run and passing alongside these — 1428 tests total, no regressions (Trading 212's own activity tests, now reading from the moved/generalized `activity-normalizer.ts` and `activity-list.tsx`, still pass unchanged).

### Verification

`tsc --noEmit`, `npm run lint`, and `npm test` (1428/1428 passing) all pass cleanly. `npm run build` passes with no IBKR credentials configured. The actual `/pa/transactions` call against a real IBKR account could not be tested — no consumer key, RSA credentials, or DH prime exist yet (see [§17](#17-blockers), unchanged).

### Explicit scope boundary

Per this phase's own instructions: no trading, order placement, order cancellation, order modification, or `/iserver/*` endpoint was introduced. No Compass Agent integration was touched. Orders (lifecycle sense), fees, and deposits/withdrawals remain genuinely unimplemented — documented above as a researched API limitation, never silently represented as "0 results" without explanation.
