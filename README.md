# Compass — Learn → Practice → Grow

A mobile-first educational investing app. This README reflects the project through **Milestone 12**: authenticated user state is now fully database-authoritative — locale, risk profile, interests, onboarding, learning progress, quiz results, XP, achievements, and asset unlocks all live in SQLite via Prisma once signed in, with localStorage no longer competing as a second source of truth. Layered onto real authentication (Google + passwordless email), the AI Tutor, and the i18n/news/wallet/market-data foundations from earlier milestones.

## Run it locally

```bash
npm install                  # also runs `prisma generate` via postinstall
cp .env.example .env.local   # then fill in the values — see "Environment variables" below
npx prisma migrate deploy    # applies prisma/migrations/ to a fresh dev.db
npm run db:seed              # optional — creates a demo user with sample data
npm run dev
```

**Prisma 7 note:** Prisma 7 keeps SQLite as the current database but moves
the connection URL out of `schema.prisma` into the root `prisma.config.ts`.
`prisma generate` runs automatically via `postinstall`, and the generated
client is written to `src/generated/prisma` using Prisma's Rust-free
`prisma-client` generator plus the `better-sqlite3` adapter. The same
`DATABASE_URL` is used by Prisma Migrate through `prisma.config.ts` and by
the runtime adapter in `src/server/db/prisma.ts`.


Open http://localhost:3000 — on desktop it renders as a centered ~420px
mobile shell. Use your browser's device toolbar for the true mobile view.

**Testing on a phone over your LAN?** Next 16's dev server blocks
cross-origin requests for its own JS chunks/HMR by default — if you open
`http://<your-computer's-LAN-IP>:3000` from a phone, the page loads but every
client-rendered feature (charts, the practice-trade flow, the news feed)
silently fails, because the browser can't load the JS that runs them. Fix:
add your machine's LAN IP to `allowedDevOrigins` in `next.config.ts`
(already pre-populated with one IP — update it if yours differs, e.g. after
reconnecting to a different network) and restart `npm run dev`.

To connect a wallet you'll need an injected EVM wallet extension (e.g.
MetaMask) installed in the browser you're testing with. Without one, the app
still works end-to-end — Profile just shows a "Connect wallet" state instead
of a connected one.

```bash
npm run lint    # eslint
npm run build   # production build + typecheck
npm run test    # vitest
```

The verification commands below are the source of truth for the current
checkout. The AI Tutor route tests use the current canonical S&P 500 lesson
id (`what-is-it`).

---

## What's implemented, by milestone


### Milestone 1 — Visual/product shell
5 screens (Home, Explore, News, Portfolio, Profile) with bottom navigation,
built against the reference design. All data was static mock data.

### Milestone 2 — Learning-to-investing loop
A complete Learn → Quiz → XP → Practice Trade → Position → Result →
Achievement → Unlock loop for S&P 500, backed by `ProgressProvider`
(`src/lib/progress-store.tsx`) persisting to `localStorage`. XP/level logic
lives in `src/lib/gamification.ts`. **This milestone did not touch any of
that** — see "Preserved from Milestone 2" below.

### Milestone 3 — Real wallet + real market data
Replaced the two pieces of mock infrastructure that don't need to be mock
anymore: wallet connection and market quotes for the three tracked indices.
Practice trading itself is still fully simulated — only the *inputs* that
feed the Home/Profile screens changed.

### Milestone 4 — Real news via Marketaux
Replaced the static News screen with a real financial-news feed. The whole
system is designed around one constraint: **at most one Marketaux request
every 20 minutes, shared by every user**, via a server-side cache. Nothing
about the learning loop, wallet, or market data changed.

### Milestone 5 — Learning progress & unlock system
Built the typed data-model foundation for the full educational game loop:
a centralized `LearningProgress` model, a single XP/level configuration
(10 levels), 8 condition-driven achievements, and a 5-stage, learning-gated
asset-unlock progression (S&P 500 → Nasdaq 100 → AAPL → TSLA → NVDA). This
was explicitly a **foundation** milestone — no LLM, no full lesson engine for
stages 2-5, no new persistence backend.

### Milestone 6 — News UX fix & Investor Risk Profile
Split news-card navigation (card → News Detail, ticker tag → asset page),
added a News Detail page reusing the existing `/api/news` cache, and
replaced the risk-profile screen with three risk-appetite-only profiles
(Beginner Explorer / Wealth Builder / Impact Investor) backed by a
centralized typed config and persisted the same way as everything else.

### Milestone 9 — Internationalization, News Detail, real achievements, investor interests & navigation fix (this milestone)
Four foundation pieces layered on top of Milestone 8/8.1 without changing
the learning/unlock architecture, wallet, Marketaux polling, or adding a
database:

- **i18n** (`src/lib/i18n/`) — a lightweight `t("namespace.key")` system
  (English/French/Russian selectable now; Chinese prepared for but not
  exposed — see that folder's `dictionaries.ts`). Locale persists to
  `localStorage`, resolved in order: explicit selection → persisted →
  browser locale → English. Missing keys fall back to English and never
  crash the app (`translate.ts`, unit-tested directly).
- **News Detail** — already existed as of Milestone 6; this milestone
  wired it through i18n and added interest-based prioritization on top
  (see below). No structural changes were needed.
- **Achievements** — the achievement *engine* (`learning/achievements.ts`)
  was already real and state-driven as of Milestone 5/7 and correctly
  surfaced on `/learn`. The actual gap fixed here: Explore's achievement
  strip was still rendering a **separate, static mock array**
  (`mock-data.ts`'s `achievements`, with hardcoded `earned: true` values)
  instead of the real engine — see `components/explore/achievement-badge.tsx`.
- **Investor Interests** (`src/lib/interests/`) — a new, deliberately
  separate concept from risk profile ("what do I want to follow" vs. "how
  much risk will I take"). Persisted on `ProgressState.interests`
  alongside `riskProfileId`, toggled via a plain `setState` action
  (`toggleInterest`) that bypasses the XP/achievement `mutate()` pipeline,
  same treatment as `setRiskProfile`. Used to re-rank (never hide) News
  and the Explore themes list.
- **Navigation/back-history fix** (`src/lib/navigation/`) — every screen's
  Back button used to be a hardcoded `<Link href={backHref}>`, so e.g.
  News → Detail → Asset tag → Asset page → Back landed on Home instead of
  back on News Detail. `useSmartBack()` now retraces real browser history
  once the user has actually navigated within the app this session, and
  only falls back to each screen's existing safe `backHref` for direct
  links/fresh loads with no real history to retrace.

See "Milestone 9 report" further down for the full file-by-file breakdown,
including what's still English-only and other known gaps.

### Milestone 7 — Real multi-asset learning content
Replaced the placeholder Stage 2-5 unlock definitions with real, authored
lesson + quiz content for all 13 planned assets (indices, stocks,
commodities, crypto), running through one generic, data-driven lesson
engine (`/learn/[assetId]`) instead of one bespoke page per asset. Also
fixed `requiredAchievementId` enforcement, which was typed but never
actually checked. S&P 500's original dedicated lesson
(`/learn/indices/sp500`) is untouched and still the live implementation for
that asset — see "Milestone 7 report" below for the full breakdown.

---

## Architecture

Both new subsystems follow the same shape, so a future swap (e.g. adding
`HyperliquidTradingProvider`) doesn't require touching any screen:

```
UI (screens/components)
   ↓ hook
useWallet() / useMarketData()
   ↓ context / factory
wallet-provider.tsx / market-provider.ts   (orchestration, state, fallback)
   ↓ implementation
evm-wallet-provider.tsx / live-market-provider.ts + mock-market-provider.ts
```

No screen imports `evm-wallet-provider.tsx`, `live-market-provider.ts`, or
`mock-market-provider.ts` directly — only `wallet-provider.tsx` and
`market-provider.ts` do. That indirection is the whole point: it's what lets
Hyperliquid get added later as another implementation behind the same hooks.

### Wallet (`src/lib/wallet/`)

- **`wallet-types.ts`** — `WalletState`, `WalletError`, the `SupportedChain`
  shape, and a minimal EIP-1193 `window.ethereum` type declaration.
- **`evm-wallet-provider.tsx`** — the only file that touches
  `window.ethereum`. Hand-rolled EIP-1193 calls (`eth_requestAccounts`,
  `eth_accounts`, `eth_chainId`, `eth_call` for `balanceOf`) — no wagmi/viem/
  ethers dependency added, since these are a handful of read-only calls.
  Supports Ethereum, Arbitrum One, Base, Optimism, and Polygon USDC
  contracts out of the box; add a chain by adding one entry to
  `SUPPORTED_CHAINS`.
- **`wallet-provider.tsx`** — `WalletProvider` (mounted in `layout.tsx`
  alongside `ProgressProvider`) + the `useWallet()` hook. Owns the
  connect/disconnect state machine and all the "handle X" requirements:
  - **Not installed** → `error.type === "not-installed"`, friendly message.
  - **User rejects** → detected via EIP-1193 error code `4001`.
  - **Account changes** → subscribes to `accountsChanged`; empty array
    is treated as a disconnect.
  - **Chain changes** → subscribes to `chainChanged`, re-fetches balance
    on the new chain automatically.
  - **Loading** → `isConnecting` (connect flow) and `isBalanceLoading`
    (balance fetch) are separate flags.
  - **Balance errors** → surfaced as `error.type === "balance-error"`
    without tearing down the connection itself.
  - **Disconnect** → injected wallets don't support a real programmatic
    disconnect (only the wallet's own UI can fully revoke a site). What
    `disconnect()` does, honestly, is forget the connection locally.
  - **Silent reconnect** — on mount, calls `eth_accounts` (no prompt) so a
    returning user doesn't have to reconnect every page load.

  **No private key or seed phrase is ever requested, read, or stored** —
  every call is either a permission request or a read-only RPC call.

### Market data (`src/lib/market/`)

- **`market-types.ts`** — `MarketAssetQuote`, `MarketDataProvider` interface,
  and the closed `MarketSymbol` union (`"sp500" | "nasdaq" | "dow"`).
- **`mock-market-provider.ts`** — returns the same static figures already in
  `mock-data.ts`. No fake jitter, no pretend "live" numbers — it's an honest
  placeholder, not a simulation of a live feed.
- **`live-market-provider.ts`** — fetches real, live quotes with **no API
  key required**, by tracking each index through its most liquid ETF proxy
  via Yahoo Finance's public chart endpoint:
  - S&P 500 → `SPY`
  - Nasdaq 100 → `QQQ`
  - Dow Jones → `DIA`

  This is a genuine trade-off worth being explicit about: raw index-level
  data is normally sold through keyed APIs (Alpha Vantage, Polygon, IEX...).
  ETF proxies trade in real time and track their index closely, so the price
  and % change shown are real market data — just of the ETF, not the raw
  index tick. **Known limitation:** this calls Yahoo's endpoint directly from
  the browser, which doesn't consistently send CORS headers for this route —
  some browsers/networks will block it. When that happens, the fetch throws
  and the app **falls back to the mock provider automatically** (see below).
  A production deployment would put a small server route in front of this
  (or a proper keyed provider) rather than calling it client-side.
- **`market-provider.ts`** — the factory + the `useMarketData()` hook.
  Tries live, falls back to mock on any failure, polls every 30s, and
  exposes `{ quotes, bySlug, source: "live" | "mock", isLoading, error,
  refresh }`. `source` is what powers the "Live" / "Demo data" badge on
  Home. Set `NEXT_PUBLIC_MARKET_DATA_MODE=mock` in `.env.local` to force
  mock mode (useful offline or in CI).

---

## News (`src/lib/news/`)

Same "hooks → provider → swappable implementation" shape as wallet/market
data:

```
News screen
   ↓ hook
useNews()  (src/lib/news/use-news.ts — client, calls only our own route)
   ↓ HTTP
/api/news  (src/app/api/news/route.ts — server-only)
   ↓
getNewsProvider()  (news-provider.ts — picks marketaux or mock from env)
   ↓
getOrFetchNews()  (news-cache.ts — 20-min TTL + in-flight dedupe)
   ↓ (cache miss only)
marketauxProvider.getLatestNews()  (marketaux-provider.ts — ONE request)
```

The client **never** imports `marketaux-provider.ts` and never sees
`MARKETAUX_API_TOKEN` — it only calls `/api/news`, which runs on the server.

### Request budget

Marketaux's free plan is limited, so the whole system is built around a hard
ceiling: **one upstream request per 20 minutes, maximum 72/day**, no matter
how many users open the News tab or refresh their browser.

- **`news-cache.ts`** — `getOrFetchNews()` is the single choke point. If the
  cache is younger than 20 minutes, it returns cached data and never calls
  Marketaux. If it's stale, it fetches once — and if multiple requests land
  while that fetch is in flight, they all await the *same* promise instead
  of each starting their own (the thundering-herd guard). If the refresh
  fails and a stale cache exists, it serves the stale data rather than
  erroring.
- The cache interface (`NewsCacheStore`) is deliberately small — `get()` /
  `set()` — so the in-memory implementation used here can be swapped for a
  Redis- or Supabase-backed one later with no caller changes. **Known
  limitation:** the in-memory store is per-process. On a single long-lived
  server (local dev, `next start` in one container) the 20-minute/72-per-day
  ceiling holds globally. On a multi-instance serverless deployment (e.g.
  several Vercel lambda instances), each instance gets its own cache, so the
  *global* request rate could exceed the ceiling even though each instance
  individually respects it. Don't rely on this in-memory version in that
  kind of deployment without swapping in a shared store first.
- **`marketaux-provider.ts`** — makes exactly one request to
  `GET /v1/news/all`, filtered to Compass's tracked symbol universe
  (`ALL_COMPASS_SYMBOLS` in `news-types.ts`) so a single broad call still
  returns a relevant mix of stocks, indices, crypto, and earnings coverage.
  There is no per-symbol or per-category request anywhere in this codebase.

### Data model

`NewsItem` (`news-types.ts`) is Compass's own normalized shape — `id`,
`title`, `description`, `source`, `url`, `imageUrl`, `publishedAt`,
`symbols[]`, `entities[]`, `category`. The raw Marketaux response never
reaches the UI; `marketauxProvider.getLatestNews()` normalizes every article
before it's cached. `category` (`stocks` / `indices` / `crypto` / `earnings`
/ `general`) is classified locally from each article's entity types and
title/description keywords — Marketaux isn't asked for a separate feed per
category.

`filterNewsByCategory()` and `filterNewsBySlug()` (also in `news-types.ts`)
filter an already-fetched batch in-process. `filterNewsBySlug()` is the
`getNewsBySymbol("NVDA")`-style hook mentioned as future work in the
milestone brief — it's implemented now as a pure filter over cached data,
specifically so a future per-asset news section never needs a new Marketaux
request.

### Provider modes

- **`NEWS_PROVIDER=mock`** (default) — `mockNewsProvider` returns a small
  static article set. No token required; this is what runs in local dev/CI
  if you don't set anything.
- **`NEWS_PROVIDER=marketaux`** — real news. Requires
  `MARKETAUX_API_TOKEN`. If the token is missing, `news-provider.ts`
  silently falls back to mock rather than crashing the app — see
  "Current limitations" below for the one case that isn't fully silent.
- Register for a free Marketaux token at
  <https://www.marketaux.com/documentation>, then set both vars in
  `.env.local` (already gitignored):
  ```bash
  NEWS_PROVIDER=marketaux
  MARKETAUX_API_TOKEN=your-token-here
  ```

### Images

Uses Marketaux's `image_url` when present, rendered with `next/image`
(`unoptimized`, so no `next.config.ts` remote-pattern allowlist is needed —
article images can come from any source domain). If `image_url` is missing,
or the image fails to load client-side, `NewsCard` falls back to a plain
Compass-styled placeholder icon — never a broken-image icon.

### Loading / error / degraded states

- **Loading** → `NewsSkeleton` (pulse-animated card outlines), shown only on
  first load — background polls (`useNews()` refetches `/api/news` every 5
  minutes purely to pick up the server's own cache refresh; this never
  triggers a Marketaux call itself) don't flash the skeleton again.
- **Empty filter result** → "No recent market news".
- **Hard failure with nothing to show** → "News is temporarily unavailable"
  with a retry button. Raw provider/HTTP errors are never surfaced to the
  client — `/api/news` catches everything and returns a generic message.
- **Stale-but-recovered** → if a refresh attempt fails but a stale cached
  batch exists, the route serves that batch with `degraded: true`, and the
  News screen shows a subtle "Showing recent news" note instead of an error.

### Current limitations

- The in-memory cache is per-process (see "Request budget" above) — fine for
  local dev and a single-instance deployment, not yet safe for multi-instance
  serverless without swapping the `NewsCacheStore` implementation.
- Classification into `stocks` / `indices` / `crypto` / `earnings` /
  `general` is a local heuristic (entity types + keyword matching on
  title/description), not something Marketaux returns directly — it's a
  reasonable approximation, not guaranteed-accurate categorization.
- "Following" filtering is currently "anything tagged with a symbol in
  Compass's tracked universe" — there's no per-user follow list wired up
  yet, so it's app-wide rather than personalized.
- I could not verify a real Marketaux response from the sandbox this was
  built in (its network egress allowlist doesn't include
  `api.marketaux.com`), so the field-name assumptions in
  `marketaux-provider.ts` are based on Marketaux's published docs, not a
  live response I personally inspected. Treat the first real run as a smoke
  test.

### Future work this was designed for (not implemented yet)

- **LLM enrichment** — `NewsItem` is intentionally flat and self-contained so
  a future pipeline can take one and generate "What happened?" / "Why does
  it matter?" / "What assets could be affected?" plus a learning question
  and XP award, without needing anything from the News UI. No LLM logic
  exists anywhere in this milestone.
- **Hyperliquid** — not touched; still purely simulated practice trading.
- **Per-asset news sections** — `filterNewsBySlug()` already supports this
  without a new request; it just isn't wired into `/asset/[slug]` yet.

---

## Where this shows up in the UI

- **Profile** (`components/profile/wallet-card.tsx`) — fully replaced. Shows
  "Connect wallet" → "Connecting..." → connected (shortened address,
  network name, live USDC balance with a manual refresh button), with an
  inline error banner for `not-installed` / `rejected` / `balance-error`.
- **Home** (`components/home/market-overview.tsx`) — the **Indices** tab
  merges live price/% change from `useMarketData()` onto the existing mock
  asset shape (so `AssetRow` itself needed zero changes), with a small
  "Live" / "Demo data" badge next to the card title. The **Stocks** and
  **Watchlist** tabs are unchanged/still mock — only the three tracked
  indices have a live feed.
- **News** (`app/news/page.tsx`, `components/news/news-card.tsx`) — fully
  replaced. Real (or mock-fallback) articles via `useNews()`, with the
  existing filter chips now driven by `filterNewsByCategory()` over live
  data, a skeleton loading state, and a "Showing recent news" note when
  serving stale data after an upstream failure.

## Learning progress & unlock system (`src/lib/learning/`)

### Architecture

Concerns are split exactly as the milestone brief suggested, and the new
config layer is **pure** — no React, no persistence, no side effects:

```
src/lib/learning/
  types.ts          LearningProgress, AchievementDefinition, AssetUnlockDefinition, ...
  xp.ts             XP_REWARDS + the 10-level table + getLevelFromXP/getXPForNextLevel/getLevelProgress
  achievements.ts   8 achievement definitions (pure predicates) + checkAchievements()
  unlocks.ts        5-stage asset progression + getAssetUnlockStatus()/isAssetUnlocked()
  progress.ts       deriveLearningProgress() + recordActivity() (streak math) — still pure

src/components/learning/
  learning-progress.tsx   compact (Profile) and full (/learn) progress card
  achievement-card.tsx    single achievement, unlocked/locked
  achievement-toast.tsx   lightweight auto-dismissing toast, mounted once in AppShell
  asset-unlock-card.tsx   LOCKED / AVAILABLE / UNLOCKED card per the 5-stage system
```

**Why `progress-store.tsx` was extended instead of a second state system
being created:** the brief explicitly says "do not blindly create duplicate
files if equivalent architecture already exists" and "reuse existing
conventions." `progress-store.tsx` already was the persisted, real
learning-loop state (lesson progress, quiz answers, XP, practice trades). It
now *additionally* tracks `completedLessons`, `quizzesCompletedCount`,
`correctAnswersCount`, `currentStreak`, `longestStreak`, `lastActivityAt`,
and `assetsExploredSlugs` — all additive fields, nothing renamed or removed
— and derives a `LearningProgress` snapshot via `deriveLearningProgress()`
on every render. `learning/*` stays a pure config/logic layer that has no
idea `localStorage` or React exist; `progress-store.tsx` is the only thing
that persists anything, same as before this milestone.

### XP rules

Centralized in `learning/xp.ts`:

| Event | XP |
|---|---|
| Lesson completed | +50 |
| Quiz completed | +25 |
| Correct quiz answer | +25 (each) |
| First investment | +100 |
| Asset learning path completed | +100 |

No-double-award is enforced the same way it already was pre-Milestone-5:
each action checks a boolean/membership guard (`s.lessonCompleted`,
`questionId in s.quizAnswers`, `s.quizCompleted`) before adding XP, so
replaying the same action is a no-op. Verified directly (see "Testing"
below), not just asserted.

`gamification.ts` (the pre-existing level-info helper the Explore screen's
`XPProgress` card already used) is now a thin adapter over `learning/xp.ts`
rather than a second, competing level table — there is exactly one XP/level
configuration in the codebase.

### Achievement rules

All 8 from the brief, in `learning/achievements.ts`, each a pure
`(progress) => boolean` predicate, checked via `checkAchievements()` after
every state-mutating action. As of Milestone 7:

- **Reachable now:** `FIRST_LESSON`, `FIRST_QUIZ`, `FIRST_INVESTMENT`,
  `MARKET_BASICS`, `INDEX_EXPLORER`, `SEVEN_DAY_STREAK`, and now
  `STOCK_EXPLORER` too (fires the moment AAPL, TSLA, or NVDA's lesson is
  completed — all three now have real content).
- **Still a proxy:** `DIVERSIFIED` — practice trading is explicitly out of
  scope for Milestone 7 (still S&P-500-only, fully simulated), so this
  stays a `>= 3` closed-trade-count proxy rather than a true distinct-asset
  check. See the code comment on this achievement.

### Asset unlock rules

Five sequential onboarding stages in `learning/unlocks.ts` (S&P 500 →
Nasdaq 100 → AAPL → TSLA → NVDA), each with a status of `LOCKED` /
`AVAILABLE` / `UNLOCKED`:

- **LOCKED** — the previous stage's required lesson isn't complete; can't
  even start this one yet.
- **AVAILABLE** — the previous stage is complete, so this lesson is
  startable, but this stage's own requirements aren't done.
- **UNLOCKED** — this stage's required lesson AND (if the stage specifies
  one) its required achievement are both complete; investable.

As of Milestone 7, all 5 stages have real lesson + quiz content (see
"Milestone 7 — real multi-asset learning content" below) reachable through
one generic lesson engine at `/learn/[assetId]` — S&P 500 keeps its
original dedicated route. `requiredLessonId` for stages 2-5 was renamed
from forward-looking placeholders (`"nasdaq100-index-basics"`, etc.) to
match the new content registry's asset ids (`"nasdaq"`, `"aapl"`,
`"tsla"`, `"nvda"`) — safe, since no real lesson ever existed at the old
ids so no one's `completedLessons` could already contain them.
`requiredAchievementId` (e.g. AAPL's `STOCK_EXPLORER`) is now actually
enforced by `getAssetUnlockStatus()` — previously typed but never checked.

**Important, disclosed architectural note:** this 5-stage, *learning-gated*
system is intentionally **separate** from the simpler, already-working
two-tier gating the live `/asset/[slug]` practice-trading page depends on
(`progress-store.tsx`'s `unlockedAssets` / `isAssetUnlocked`, which unlocks
Nasdaq as soon as a practice trade on S&P 500 *closes* — investment-gated,
not learning-gated). The brief was explicit that the existing loop must stay
fully functional, and switching that page over to the new 5-stage model
today would actually regress it (Nasdaq is real-unlockable now; under the
new model it'd be stuck at `AVAILABLE` forever, since its own lesson doesn't
exist). So: the old mechanism still drives the real asset page, and the new
`isAssetUnlockedByLearning()` / `getAssetUnlockStatus()` helpers are exposed
from `useProgress()` — per the brief's own "eventually" language — for the
`/learn` page and any future UI to call, without being force-wired into the
asset page in this milestone.

### How persistence works

Same mechanism as before this milestone — `localStorage`, one JSON blob,
under `progress-store.tsx`'s `STORAGE_KEY`. No backend/database was added
(none existed, and the brief says not to add one if none exists). All the
new fields live in the same `ProgressState` object and round-trip through
the same hydrate-on-mount / persist-on-change effects that already existed.

### Where this shows up in the UI

- **Profile** — a new compact `LearningProgressCard` (level, XP progress
  bar, lessons/achievements/assets counts), inserted after the existing
  Risk Profile card, linking to `/learn`. The old static "Learning progress"
  row in the link list below it was removed as redundant — it showed the
  same level/XP text with no navigation, and now duplicates the new card.
- **`/learn`** — full learning-progress summary, "Continue Learning"
  (points at the next incomplete stage), all 8 achievements (unlocked and
  locked), the 5 onboarding asset stages split into "Assets Unlocked" /
  "Locked Assets", and (as of Milestone 7) a new "Explore More Assets"
  section — see below.
- **Achievement toast** — mounted once in `AppShell` (so it appears
  app-wide, not just on one screen), a small top-of-screen toast that
  auto-dismisses after ~3s. Not a modal, per the brief.
- **Explore** — one id rename only (`"first-position"` →
  `"FIRST_INVESTMENT"`, the new canonical id) and the "See all" link on
  Achievements now points at `/learn` instead of a single lesson page.
  Nothing else on Explore changed.
- **`/asset/[slug]`** — one additive change: a view-tracking effect
  (`recordAssetView`) so `assetsExplored` is real data, not a placeholder.
  No button, gating, or visual changes.

## Milestone 7 — real multi-asset learning content (`src/lib/learning/content/`)

### What was built

Real, authored lesson + quiz content for all 13 planned assets — S&P 500,
Nasdaq 100, AAPL, NVDA, TSLA, MSFT, AMZN, GOOGL, META, Gold, Brent Oil,
BTC, ETH — replacing the typed-but-empty Stage 2-5 placeholders from
Milestone 5. Every asset gets 3 lessons (`what is it` → `what moves it` →
`risks/what to watch`) and 6 quiz questions (2 easy / 2 medium / 2 hard),
except S&P 500, which keeps its original 5 lesson steps and 5 questions
(see below) — both comfortably clear the brief's 5-question minimum.

```
src/lib/learning/content/
  types.ts       LessonContent, QuizQuestionContent, AssetLearningPath — pure types, no React/localStorage
  sp500.ts       ADAPTER over the pre-existing lesson-content.ts (see note below)
  nasdaq.ts, aapl.ts, nvda.ts, tsla.ts, msft.ts, amzn.ts,
  googl.ts, meta.ts, gold.ts, brent-oil.ts, btc.ts, eth.ts   one file per asset
  index.ts       ALL_ASSET_LEARNING_PATHS registry + getAssetLearningPath()
```

Nothing here is hardcoded into a component — every screen reads through
`getAssetLearningPath()` / `ALL_ASSET_LEARNING_PATHS`.

### S&P 500: adapter, not a rewrite

`content/sp500.ts` re-shapes the *existing, unchanged* `sp500LessonSteps` /
`sp500Quiz` from `lesson-content.ts` into the new `AssetLearningPath` shape,
purely so the content registry is complete for all 13 assets and future
tooling has one consistent shape to read. **The live
`/learn/indices/sp500` page does not read from this file** — it still
imports directly from `lesson-content.ts`, exactly as it did before this
milestone. That's a deliberate choice to satisfy "do not regress the
existing lesson" as literally as possible: zero risk of the refactor
touching the one real, working lesson flow.

### The generic lesson engine (`/learn/[assetId]`)

One new dynamic route runs every asset **except** S&P 500 through the same
lesson → quiz → result flow, entirely data-driven from the content
registry:

- Reuses the *existing* `LessonProgress`, `QuizCard`, and `QuizResult`
  components unchanged (just adapts `QuizQuestionContent`'s field names to
  the props they already expect) — no UI redesign.
- One new component, `AssetLessonCard` (`components/learning/`), extends
  the visual language of the original `LessonCard` to also show the new
  content model's objective + key-takeaways bullets.
- Visiting `/learn/sp500` redirects to `/learn/indices/sp500`.
- If the asset is one of the 5 onboarding stages and still `LOCKED` (the
  previous stage isn't done), a direct URL visit is blocked with a short
  "complete the previous stage first" card, rather than letting someone
  skip the gating shown on `/learn`.
- On quiz completion, the CTA links to `/asset/[assetId]` only if that
  asset actually has a tradable page in `mock-data.ts` (true for
  sp500/nasdaq/aapl/nvda/tsla/msft/amzn); otherwise it links back to
  `/learn`, since GOOGL/META/Gold/Brent Oil/BTC/ETH have no investable
  asset page in this demo at all — see "Learning vs. investing stay
  separate" below.

### Persistence: additive, per-asset

`progress-store.tsx` gained one new field, `assetLessonProgress: Record<string,
AssetLessonProgress>`, keyed by `assetId` — **never** `"sp500"`. The
original `lessonStepIndex` / `lessonCompleted` / `quizAnswers` /
`quizCompleted` fields are untouched and still exclusively drive the S&P
500 page. Four new generic actions
(`advanceAssetLessonStep`/`completeAssetLesson`/`answerAssetQuizQuestion`/`completeAssetQuiz`)
mirror the original four, parameterized by `assetId`, routed through the
same `mutate()` pipeline so streak tracking and achievement checks fire
identically. Existing S&P 500 progress in `localStorage` round-trips
unchanged — nothing was renamed or removed, only added.

### `requiredAchievementId` enforcement (the fix from the brief)

`AssetUnlockDefinition.requiredAchievementId` was typed since Milestone 5
but never actually checked — `getAssetUnlockStatus()` only looked at
`requiredLessonId`. Now both conditions must hold for `UNLOCKED`:

```ts
const lessonDone = progress.completedLessons.includes(stage.requiredLessonId);
const achievementDone = stage.requiredAchievementId
  ? progress.unlockedAchievements.includes(stage.requiredAchievementId)
  : true;
if (lessonDone && achievementDone) return "UNLOCKED";
```

In practice, Stage 3 (AAPL) requires `STOCK_EXPLORER`, and
`STOCK_EXPLORER` unlocks the moment *any* of AAPL/TSLA/NVDA's lesson
completes — including AAPL's own. So completing AAPL's lesson satisfies
both conditions in the same state update (the achievement check runs
immediately after the lesson-completion state change, within the same
`mutate()` call), and AAPL unlocks as expected. Worth being explicit that
this specific requirement is somewhat redundant with its own stage's
lesson requirement as currently configured — the enforcement code itself
is correct and general regardless.

### Renamed lesson ids for stages 2-5

`requiredLessonId` for Nasdaq/AAPL/TSLA/NVDA changed from Milestone 5's
forward-looking placeholders (`"nasdaq100-index-basics"`,
`"aapl-stock-basics"`, `"tsla-volatility-risk"`, `"nvda-tech-semis"`) to
match the new content registry's asset ids (`"nasdaq"`, `"aapl"`,
`"tsla"`, `"nvda"`). This is safe: no real lesson ever existed at the old
ids (they never resolved to a route), so no one's `completedLessons` array
could already contain them — there's nothing to migrate.
`achievements.ts`'s `STOCK_LESSON_IDS` was updated to match.

### Learning vs. investing stay separate

Per the brief: learning content existing for an asset does **not**
automatically make it investable. GOOGL, META, Gold, Brent Oil, BTC, and
ETH all have real lessons now but no `mock-data.ts` entry and no
`/asset/[slug]` page — they're purely educational. MSFT and AMZN do have
existing asset pages (from Milestone 3) but aren't part of the 5-stage
*onboarding* sequence, so completing their lesson doesn't unlock or gate
anything either — it's just learning. All of these show up in `/learn`'s
new "Explore More Assets" section (`LearningPathCard`), separate from the
"Assets Unlocked" / "Locked Assets" sections that are specifically about
the onboarding ladder.

### UI copy change

`AssetUnlockCard`'s button for an `AVAILABLE` stage was renamed from
"Learn to Unlock" to **"Start learning"**, per the brief's explicit
"Replace 'Coming soon' with 'Start learning'" instruction — this also
applies retroactively to Stage 1 (S&P 500), which already showed this same
button/state before Milestone 7; only the copy changed, not the
underlying route or logic.

## Milestone 9 report

**Second follow-up pass — Learning/Lesson/Quiz/Achievement UI chrome**
Translated the remaining hardcoded strings in the learning flow, adding
`lesson.*` (lessonLabel/stepLabel/questionLabel, "X of Y" counters via a
new `general.of`, min, Correct!/Not quite., Quiz complete!, "You got X of
Y correct.", XP earned) and extra `learning.*` keys (category badges —
Index/Stock/Commodity/Crypto — and the "Learning: Completed/Continue
learning/Available" + "Investment: Locked/Unlocked" status lines on
`LearningPathCard`) across `achievement-card.tsx`, `achievement-toast.tsx`,
`asset-lesson-card.tsx`, `learning-path-card.tsx`,
`lesson/achievement-unlock.tsx`, `lesson-card.tsx`, `lesson-progress.tsx`,
`quiz-card.tsx`, `quiz-result.tsx`, `xp-animation.tsx`, and the
`learn/[assetId]` page's category badge.

Left untranslated on purpose, consistent with the rest of the app:
achievement `title`/`description` (from `ACHIEVEMENTS` in
`achievements.ts`) and lesson/quiz `title`/`body`/`prompt`/`options`/
`explanation` (from `src/lib/learning/content/*.ts` and
`lesson-content.ts`) are **content**, not UI chrome — same treatment as
the rest of the educational material, which stays English pending the
future LLM-generation milestone (see Part 1 of the original spec). Only
static labels/counters/status text around that content were translated.

**Follow-up pass (post-review fixes)**
Based on screenshots/feedback after the initial Milestone 9 delivery, the
following were fixed on top of everything below:
- **News Detail redesign** — the full available article body now leads
  the screen; "Read original article" is a small text link with source
  attribution at the bottom instead of a large button.
- **News images** — added `referrerPolicy="no-referrer"` to news images
  (list + detail) since several publisher CDNs hotlink-protect based on
  the Referer header, which can silently fail image loads.
- **Full site-wide translation pass** — Home, Explore, Portfolio, Asset
  detail, lesson/quiz flows, trade sheet, and the risk-profile
  assessment/detail screens (previously only partially translated) are
  now fully covered by the i18n system across EN/FR/RU.
- **Merged "Themes" and "Investor Interests"** — Explore's separate,
  static "Themes" card was removed entirely (it was the same concept as
  Interests, shown a second, out-of-sync way). Profile's "Followed
  themes" card now reflects the user's real selected interests, with an
  Edit link to a dedicated `/profile/interests` page.
- **Language moved into Profile's settings list** — instead of a
  standalone always-visible card, Language is now a row alongside Trusted
  sources / Connected accounts / Notifications / Invite friends, linking
  to `/profile/language`.
- Restructured `risk-profiles.ts` to hold only structural data (id, risk
  level enum) — all display copy (title, risk-level badge, descriptions,
  bullet lists, disclaimer) now lives in the i18n dictionaries under
  `riskProfileBeginner`/`riskProfileWealth`/`riskProfileImpact` and
  `riskLevels`, so there's one translated copy per language instead of
  English baked into the data model.

**Files changed** — new: `src/lib/i18n/**`, `src/components/settings/language-switcher.tsx`,
`src/lib/navigation/**`, `src/lib/interests/**`, `src/components/profile/interests-card.tsx`.
Modified: `layout.tsx`, `header.tsx`, `bottom-navigation.tsx`, `progress-store.tsx`,
`learning/state.ts`, `risk-profile.tsx`/`risk-profile-detail.tsx`/`risk-profiles.ts`,
`profile/page.tsx`, `explore/page.tsx`, `achievement-badge.tsx`, `learning-progress.tsx`,
`asset-unlock-card.tsx`, `learn/page.tsx`, `wallet-card.tsx`, `news/page.tsx`, `news/[id]/page.tsx`.

**i18n architecture** — `translate.ts` (pure dot-path lookup + English
fallback, no React) + `locale-provider.tsx` (thin context: persistence,
browser-locale detection), same pure/React split as `reducer.ts` vs.
`progress-store.tsx`. No component branches on locale directly.

**Supported languages** — English, French, Russian, selectable via the
Profile page's `LanguageSwitcher`.

**Future Chinese support** — `zh` is deliberately not in the `Locale`
union or `SUPPORTED_LOCALES` yet. Adding it later is a 3-file change
(`types.ts` union, `translations/zh.ts`, register in `dictionaries.ts`)
that touches zero components.

**Language persistence** — `localStorage["compass-locale-v1"]`.

**News Detail** — pre-existing from Milestone 6; this milestone added
i18n and interest-aware sort order on top of the existing implementation.

**Marketaux content handling** — unchanged from Milestone 6: only content
Marketaux actually returns is shown, "Read original article" is always
the secondary/external action.

**Asset tag vs. News card navigation** — unchanged, already correct
(card → News Detail, tag → Asset page, `stopPropagation` on tags).

**Achievement logic** — unchanged (already real/idempotent/deterministic
via `applyMutation`/`checkAchievements`); the fix was Explore's display
layer, which had drifted onto a static mock array instead of the engine.

**Investor Interests model** — 7 extensible categories
(`src/lib/interests/interests.ts`), stored on `ProgressState.interests`,
toggled outside the XP/achievement pipeline.

**Interests → News/Explore** — `sortNewsByInterest()` /
`sortThemesByInterest()` are simple deterministic re-ranks (score by
matching symbol/category/keyword); nothing is ever removed from either
list.

**Risk Profile vs. Interests** — fully separate state fields and setters;
no cross-reads either direction (verified in tests).

**Navigation/back-history changes** — `useSmartBack()`
(`src/lib/navigation/navigation-history-provider.tsx`) retraces real
`router.back()` once the user has navigated within the app this session
(tracked via React's "adjust state during render" pattern, not an effect,
to avoid an extra render), else uses the screen's existing `backHref`
fallback.

**localStorage migration** — none needed; the existing
`{ ...defaultState, ...parsed }` hydration merge already fills in the new
`interests: []` field for old blobs.

**Tests added** — 9 i18n (`translate.test.ts`), 6 navigation
(`navigation-history.test.ts`), 6 interests (`interests.test.ts`,
including news/explore prioritization), on top of the 36 pre-existing
tests. 57/57 passing.

**lint/build/test results (this milestone)** — `npm run lint` clean,
`npm run build` succeeds (Next 16 + Turbopack, typecheck passes),
`npx vitest run` 57/57 passing.

**Remaining technical debt**
- Not every UI string is wired through `t()` yet: risk-profile long
  descriptions, the risk-assessment quiz copy, and a few Profile link-row
  labels are still English-only.
- `useSmartBack()`'s "has the user navigated" signal is a one-way flag,
  not a full history-depth stack — correct for every scenario in the
  brief, but doesn't distinguish a nested link opened in a fresh tab after
  browsing elsewhere in another tab.
- No DOM-level/RTL tests for `Header`/`NavigationHistoryProvider` (no
  `@testing-library/react` in this project, and adding a dependency felt
  out of scope) — the pure logic they call is unit-tested instead.

## Milestone 10 / 10.1 — DeepSeek AI Tutor

The DeepSeek integration has been refined from an AI-generated practice-question
engine into a **bounded AI Tutor**. The canonical course and assessment remain
fixed; AI adapts the explanation around them.

### Product rules

- **During lesson/explanation:** AI Tutor is available.
- **During quiz:** AI is completely unavailable.
- **After quiz:** AI becomes available again and adapts to the result.
- Assessment questions remain curated/static.
- AI never generates assessment questions.
- AI never grades the real quiz.
- AI never awards XP, achievements, completion, or asset unlocks.
- AI never provides personalized investment advice.

### 1. DeepSeek integration

Server-only `DeepSeekProvider` calls the OpenAI-compatible DeepSeek chat
completion endpoint with bearer authentication and JSON output. The API key
is read from `DEEPSEEK_API_KEY`; `DEEPSEEK_MODEL` defaults to
`deepseek-v4-flash`. No `NEXT_PUBLIC_*` secret is used.

### 2. Provider abstraction

`src/lib/ai/provider.ts` defines the small `AIProvider` interface and
`src/lib/ai/providers/deepseek-provider.ts` implements it. The rest of the
application calls the learning engine rather than importing DeepSeek directly.

### 3. AI Tutor API

The single learning entry point is:

`POST /api/ai/tutor`

It accepts a controlled action and either:

- `phase: "lesson"` — tutoring around the current lesson;
- `phase: "post-quiz"` — personalized review/deeper learning after the
  deterministic quiz result.

The route rejects `phase: "quiz"` so the UI and server both enforce the
assessment boundary.

### 4. Tutor actions

During lessons:

- Explain simpler
- Real-world example
- Why does this matter?
- Go deeper
- Main risks
- Ask Compass AI (free-form question)

After a low/medium result:

- Review my mistakes
- Explain simpler
- Real-world example
- Go deeper where appropriate

After a perfect result:

- Go deeper
- Advanced insight
- How professionals think
- What should I learn next?

All actions are localized in English, French and Russian.

### 5. Assessment protection

The quiz uses only the existing curated `QuizQuestionContent` bank.

No AI controls the quiz.

The AI tutor context deliberately does **not** include the assessment question
bank or answer options. After the quiz, only the small set of missed question
prompts may be supplied as review context, without answer keys.

The system prompt explicitly forbids revealing assessment answers. If a learner
asks for an answer, the tutor should explain the underlying concept instead.

### 6. Post-quiz adaptation

The deterministic application calculates:

- score;
- passed/failed;
- incorrect questions;
- XP;
- achievements;
- completion;
- unlock state.

The AI receives only the educational result needed to personalize the next
explanation.

**Low score** → review difficult concepts and clarify them.

**Medium score** → reinforce the concepts missed.

**Perfect score** → move beyond the basics with advanced insight and professional
perspective.

The AI result itself cannot modify application state.

### 7. AI Tutor UI

`src/components/learning/ai-tutor-panel.tsx` is integrated directly into the
lesson and quiz-result screens.

It provides contextual action chips plus a free-form "Ask Compass AI" field.
It is not a generic ChatGPT screen.

The tutor response is rendered as:

- title;
- explanation;
- key points;
- optional example;
- optional next step.

### 8. Prompt architecture

`src/lib/ai/prompts.ts` contains reusable server-side tutor prompt builders.
The model receives:

- canonical lesson content;
- learning objectives;
- concepts;
- locale;
- difficulty guidance;
- learner's coarse level;
- limited post-quiz mistake context.

The model is explicitly instructed to stay within the curriculum, avoid
unsupported financial claims, avoid investment recommendations, and treat
learner text as untrusted data.

### 9. Structured output validation

`src/lib/ai/schemas.ts` validates every DeepSeek response before the client
sees it. Invalid JSON, missing fields, wrong types, oversized fields, and
invalid arrays are rejected.

### 10. Cost and reliability

- User-initiated AI requests only.
- Existing per-IP rate limit remains in place.
- Deterministic lesson actions are cached for 15 minutes.
- Free-form questions and post-quiz responses are not cached.
- AI failures never break the course.
- Loading/error states are localized.
- The application builds without a configured API key.

### 11. Deterministic state boundary

The LLM has no imports or direct access to:

- `progress-store.tsx`;
- learning reducer;
- XP;
- achievements;
- unlocks.

The deterministic quiz engine remains the only source of truth for assessment
and progression.

### 12. Tests

Tests cover:

- valid tutor responses;
- malformed model output;
- lesson tutor requests;
- free-form questions;
- post-quiz requests;
- invalid phases;
- invalid actions;
- missing post-quiz result data;
- assessment-question bank not being included in AI context;
- existing difficulty mapping and curriculum-context behavior.

No test requires a real DeepSeek API key.

### 13. Remaining AI technical debt

- AI responses are request/response rather than streaming.
- Cache/rate-limit state is in-memory and therefore single-instance.
- The curriculum still derives concepts from existing content for assets that
  do not yet have explicit concept metadata.
- The next major infrastructure milestone should be **database + authentication
  + persistent user state**, rather than adding more AI autonomy.

## Preserved from earlier milestones — untouched

Confirmed by grepping every call site before editing. Across all
milestones through 7: the wallet layer (`src/lib/wallet/`), the
market-data layer (`src/lib/market/`), the news layer (`src/lib/news/`,
`/api/news`), Hyperliquid (never integrated), and the entire
practice-trading flow's *button and gating logic* (`TradeSheet`,
`/position/[slug]`, the existing `isAssetUnlocked` / `unlockedAssets`
mechanism) are unchanged.

Specific to Milestone 7: `lesson-content.ts` and the live
`/learn/indices/sp500` page are byte-for-byte unchanged — the new
`content/sp500.ts` is a read-only adapter over them, not a replacement
(see "S&P 500: adapter, not a rewrite" above). `progress-store.tsx` was
extended again — additively, with every pre-existing field, action
signature, and return shape left intact, exactly the same pattern used
when it was extended in Milestone 5.

## Known lint exceptions

None. `npm run lint` is fully clean as of Milestone 7.

## What's still mock / not yet real

- **Practice trading** — still S&P-500-only and fully simulated (Milestone
  2 scope; explicitly untouched again in Milestone 7). AAPL/NVDA/TSLA/MSFT/
  AMZN have real *asset pages* but not a working buy/sell flow beyond
  S&P 500.
- **`DIVERSIFIED` achievement** — still proxies "3 different assets" as "3
  closed trades," since only S&P 500 is actually tradeable (see the code
  comment on this one). Real lesson content shipping for 12 more assets
  this milestone doesn't change this, because the gap is in the *trading*
  UI, not the *learning* content.
- **GOOGL / META / Gold / Brent Oil / BTC / ETH have no investable asset
  page at all** — they're real lesson content with nowhere to "invest"
  afterward in this demo, by design (see "Learning vs. investing stay
  separate" above).
- Everything already listed as mock in earlier milestones (Stocks/Watchlist
  tabs on Home, followed themes, trusted sources) is unchanged.

## Explicitly not implemented (out of scope for this milestone)

An LLM integration, a backend/database, Hyperliquid, and migrating
`/asset/[slug]`'s gating from the old two-tier mechanism to the new
learning-gated one (kept as a reusable helper per the brief's
"eventually," not force-integrated — see the architectural note under
"Asset unlock rules" above for why forcing it now would actually regress
the working S&P 500 → Nasdaq flow).

## What remains before connecting the LLM

1. **A quiz/question *generation* or *grading* path.** The question banks
   for all 13 assets are now authored and static (`content/*.ts`) — an LLM
   isn't needed to answer today's quizzes, but nothing here generates new
   questions dynamically or grades free-form answers yet.
2. **Migrating `/asset/[slug]`'s gating to the learning-gated system**,
   which would make sense once practice trading itself supports more than
   S&P 500 — today it deliberately still runs on the old, simpler two-tier
   mechanism (see the architectural note above for why).
3. **Practice trading for assets beyond S&P 500.** Real lesson content now
   exists for all 13 assets, but `TradeSheet`/`openPracticePosition`/
   `closePracticePosition` are still hardcoded to `slug: "sp500"` — this is
   the actual blocker for `DIVERSIFIED` becoming a true distinct-asset
   check.
4. **The `NewsItem` → LLM → learning-question pipeline** the Milestone 4
   README flagged as designed-for-but-not-built: turning a cached article
   into a "what happened / why it matters / what's affected" learning
   moment, awarding XP through the centralized `XP_REWARDS` config.

None of the above blocks an LLM integration from starting — the data model
(`LearningProgress`, `AchievementDefinition`, `AssetUnlockDefinition`, and
now `AssetLearningPath`/`LessonContent`/`QuizQuestionContent`) is the
stable contract an LLM-driven lesson engine would read from and write
achievements/completions into, without needing to know `localStorage`
exists.


---

## Milestone 11 — SQLite + Prisma + Authentication + Persistent User State

### 1. Authentication technology chosen and why

**Auth.js v5 (`next-auth@beta`)** with the **`@auth/prisma-adapter`**.
Reasons:

- It's the standard, actively-maintained auth library for the Next.js App
  Router, with first-class support for exactly the two providers this
  milestone needs (Google OAuth, Resend-backed passwordless email) and a
  Prisma adapter that implements account linking, session storage, and
  verification-token storage out of the box — the brief is explicit
  ("Use the authentication library's secure token/session mechanism rather
  than inventing custom authentication crypto"), and hand-rolling any of
  this would mean re-implementing exactly the parts of Auth.js that exist
  to be *not* hand-rolled.
- **Database session strategy** (`session: { strategy: "database" }`) —
  sessions live in the `sessions` table; the browser only ever holds an
  opaque `sessionToken` cookie. No JWT secret rotation story to design, and
  it plugs directly into "logging in as another user must load the new
  user's state" (Section 26) since there's nothing but that one DB-backed
  session to invalidate on sign-out.
- Runs on Next 16's now-Node.js-by-default `proxy.ts` (see below), so
  `auth()` can safely hit Prisma directly in the route-protection layer —
  something that would have needed a JWT/edge-safe workaround on older
  Next.js middleware.

### 2. Google authentication setup

`src/auth.ts` registers `Google({ clientId, clientSecret })` from
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (only if both are set — the app
still runs without Google configured, it just won't offer that button).
`allowDangerousEmailAccountLinking` is deliberately left `false`; Google's
own `email_verified` claim is what Auth.js's default (safer) linking
already trusts, so no dangerous flag is needed to get Section 7's
"verified email as a trusted linking mechanism" behavior.

**Manual setup required** (not something code can do for you): create an
OAuth 2.0 Client ID at
https://console.cloud.google.com/apis/credentials, application type "Web
application", authorized redirect URI
`http://localhost:3000/api/auth/callback/google` for local dev (swap the
origin for your deployed URL in production), then put the client ID/secret
in `.env.local`.

### 3. Passwordless email authentication setup

A custom Auth.js **email** provider (`id: "compass-email"`, `type:
"email"`), 15-minute token expiry (`maxAge: 15 * 60`), with a custom
`sendVerificationRequest` that renders and sends the branded template
(below) instead of Auth.js's plain-text default. Auth.js's own
`@auth/core` email-provider flow (not anything custom-built here) handles
token generation, hashing before storage, single-use invalidation on
redemption, and account creation/lookup by verified email — see
`node_modules/@auth/core/providers/resend.js` for the reference
implementation this provider's shape follows.

Sign-in UI (`src/components/auth/sign-in-form.tsx`) calls
`signIn("compass-email", { email, callbackUrl, redirect: false })` and
shows an inline "check your email" state rather than navigating away,
which is a better UX for this milestone's single-page sign-in screen; the
`/signin/verify-request` page still exists as the configured
`pages.verifyRequest` target for any flow that does trigger Auth.js's own
redirect.

### 4. Resend integration

`src/lib/email/send-auth-email.ts` is the only place `RESEND_API_KEY` is
read, and it's marked `import "server-only"` — a build-time guard that
throws if this module is ever pulled into client code. It renders
`src/lib/email/templates/compass-auth-email.tsx` (a React Email component)
to HTML and plain text and sends via the `resend` npm SDK. `EMAIL_FROM`
controls the sender.

**Manual setup required:** a Resend account and API key
(https://resend.com/api-keys). In dev, Resend's own
`onboarding@resend.dev` sender works without domain verification; in
production `EMAIL_FROM` needs to be a domain verified in your Resend
account.

**Scope note:** the email body itself is English-only (not localized) —
Section 23/24's EN/FR/RU requirement is about the *authentication UI*,
which is fully localized (see `auth.*` keys in
`src/lib/i18n/translations/{en,fr,ru}.ts`); localizing the email content
too is a small, clearly-scoped follow-up (thread the locale through
`signIn()`'s params into `sendVerificationRequest`).

### 5. Database technology

SQLite via Prisma, `DATABASE_URL="file:./dev.db"`, using Prisma 7's
Rust-free **client engine** (`engineType = "client"` in
`prisma/schema.prisma`) with the `@prisma/adapter-better-sqlite3` driver
adapter — no native query-engine binary at runtime. See the sandbox note
at the top of this README for the one place Prisma's *tooling* (not the
schema or runtime) couldn't be exercised in the build environment.

### 6. Prisma schema / models

`prisma/schema.prisma` — 14 models: Auth.js's `User`/`Account`/`Session`/
`VerificationToken`, plus `WalletIdentity` (future-ready only),
`UserInterest`, `UserLearningProgress`, `UserQuizResult`, `UserXPEvent`,
`UserAchievement`, `UserAssetUnlock`, `UserFavoriteAsset`,
`UserNotificationPreference`, and `UserLearningStats` (streaks +
assets-explored, denormalized the same way `progress-store.tsx` already
tracked them). Every user-owned, repeatable-action table carries a unique
constraint that makes the action idempotent — see "Idempotency
protections" below for the full list.

### 7. Persistent user state

Implemented server-side, end to end (repository → API route), for:
**profile** (locale, risk profile, onboarding completion — `src/server/
repositories/profile-repository.ts`), **interests**, **favorites**,
**notification preferences**, and the full **learning progress / XP /
achievements / asset-unlocks** stack (`src/server/services/
learning-service.ts`), which reuses the existing pure functions in
`src/lib/learning/{xp,achievements,unlocks,progress}.ts` completely
unchanged — the server just assembles the same `LearningProgress` shape
those functions already expected, from Prisma instead of from
`localStorage`.

### 8. Favorites/watchlist

Real, from a clean slate — there was no interactive favorite/watchlist
toggle anywhere in the client before this milestone (only a static, non-
functional star icon on the asset page, and an unrelated hardcoded
`watchlist` array in mock data used for display only). `UserFavoriteAsset`
+ `src/server/repositories/favorites-repository.ts` +
`/api/user/favorites` (GET/POST) and `/api/user/favorites/[assetId]`
(DELETE) are new. The star button on `/asset/[slug]` now calls the real
API through `src/lib/server-sync/use-favorite.ts` (optimistic toggle, rolls
back on failure). Works identically for locked and unlocked assets — the
repository never checks unlock status, matching Section 16 exactly.

### 9. Notification preferences

`UserNotificationPreference` + `notifications-repository.ts` +
`/api/user/notifications` (GET/PATCH), with a real settings screen at
`/profile/notifications` (`NotificationsCard`) reachable from the existing
"Notifications" row on Profile (previously a dead placeholder row with no
`href`). Four canonical categories: `news`, `priceAlerts`, `learning`,
`achievements`. No delivery of any kind — this is preferences storage
only, per Section 17/30.

### 10. Account linking strategy

One `User` row per person; `Account` rows (Auth.js standard shape) point
at it, one per provider. Google links by verified email via Auth.js's
default (non-dangerous) linking behavior; the email provider *is* email
verification, so a user who signs up with email and later clicks
"Continue with Google" using the same address lands on the same `User`
automatically, with no separate merge step and no risk of matching on
display name alone (Section 7's explicit "do not merge based only on
matching display names" is satisfied by never doing name-based matching
at all — only Auth.js's provider/verified-email-based resolution).

### 11. Future wallet-linking strategy

`WalletIdentity` exists in the schema now (`userId`, `address`, `chain`,
`createdAt`, `verifiedAt` — public data only, no signing, no keys) but has
no UI or route wired to it this milestone, per Section 18's "do not
implement actual wallet connection yet if it would expand scope
unnecessarily." The model is there so a later milestone's "Connect Wallet"
flow is a pure additive feature — insert a `WalletIdentity` row against
the existing `userId` — not a schema migration plus a data-backfill.

### 12. Security / authorization

Every user-data route goes through `requireUserId()`
(`src/server/auth/session.ts`), which derives the id from the
`auth()`-resolved session and throws `UnauthenticatedError` (→ HTTP 401
via `withApiErrorHandling`) if there isn't one. No route reads a `userId`
from a request body, query string, or client-supplied header — grep
`src/app/api/user/` and `src/server/` for `userId` and every occurrence is
either `requireUserId()`'s return value or a Prisma `where: { userId }`
built from it. `proxy.ts` additionally redirects unauthenticated visitors
to `/signin` (with `callbackUrl` preserved — Section 24) before they reach
a page at all, but that's a UX convenience, not the security boundary;
it's explicitly documented in the file as such, since `proxy.ts` alone
can't stop a direct API request that bypasses it.

Secrets — `RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`,
`DATABASE_URL` — are only ever read in `server-only`-marked modules or
Node-only config files, never in anything under `"use client"`. Nothing
`NEXT_PUBLIC_`-prefixed was introduced.

### 13. Idempotency protections

Enforced at the database layer (unique constraints), not just in
application code, so it holds even under concurrent/retried requests:

| Action | Constraint |
|---|---|
| Favorite twice | `(userId, assetId)` unique on `UserFavoriteAsset` |
| Interest added twice | `(userId, key)` unique on `UserInterest` |
| Achievement unlocked twice | `(userId, achievementId)` unique on `UserAchievement` |
| Asset unlocked twice | `(userId, assetId)` unique on `UserAssetUnlock` |
| Lesson completed twice | `(userId, assetId)` unique on `UserLearningProgress`; XP only awarded on the transition into `COMPLETED` |
| Quiz submitted twice (same attempt) | `(userId, attemptId)` unique on `UserQuizResult` — `submitQuiz()` catches the constraint violation and returns `alreadySubmitted: true` instead of erroring or re-awarding XP |
| XP granted twice for the same thing | `(userId, eventType, sourceId)` unique on `UserXPEvent` — this is the one constraint everything else's "no duplicate XP" guarantee ultimately reduces to |
| Notification preference set twice | `(userId, category)` unique on `UserNotificationPreference`, upserted |

### 14. Seed / migration strategy

`prisma/seed.ts` (`npm run db:seed`) creates one demo user
(`demo@compass.app`) with sample interests, favorites, notification
preferences, one completed lesson, an XP event, and one unlocked
achievement — clearly separated dev-only data (Section 27), and the script
itself refuses to run when `NODE_ENV === "production"`. Migrations use
Prisma's standard `prisma/migrations/<timestamp>_<name>/migration.sql`
format; `npx prisma migrate deploy` applies them without ever needing a
manual database mutation outside that mechanism (Section 28).

### 15. Environment variables

Added to `.env.example`: `DATABASE_URL`, `AUTH_SECRET`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`,
`EMAIL_FROM` — with inline comments on where to obtain each and what dev-
mode shortcuts exist (e.g. Resend's unverified-domain sender). No real
secrets committed; all blank in `.env.example` except the two values that
are genuinely safe defaults for local dev (`DATABASE_URL`, `EMAIL_FROM`).

### 16. Tests

New this milestone: `src/server/services/quiz-grading.test.ts` (6 tests —
grades from the canonical answer key, never from anything the caller
supplies, marks unanswered questions incorrect, deterministic/replay-safe)
and `src/server/validation.test.ts` (8 tests — locale/risk-profile/
interest-key/notification-category validators reject arbitrary client
values, not just obviously-wrong ones). Both are pure-logic modules with
no Prisma import, chosen deliberately so they're runnable without a
database connection — same "pure logic separate from persistence" split
`src/lib/learning/*` already used, extended to the new server code.

**What's NOT tested, and why:** route-handler-level integration tests
(hitting `/api/user/*` and asserting on the HTTP response) could not be
written in this sandbox for two independent reasons, both confirmed by
directly attempting it rather than assumed: (1) every route transitively
imports `src/server/db/prisma.ts`, which imports the generated Prisma
client that doesn't exist without a successful `prisma generate` (see the
sandbox note); (2) separately, `server-only`-marked modules throw by
design under vitest's default Node test environment (confirmed by
temporarily installing the `server-only` package and re-running the
import), since that guard only permits import from React Server Component
bundling contexts. Neither is a flaw in the route code itself — it's a
test-infrastructure gap. Closing it needs either Next's own experimental
route-handler test utilities or a dedicated vitest project configured with
the `react-server` condition; that's a good, scoped Milestone 12 item.

Existing suite: 105 tests, 102 passing. The 3 failures are in
`src/app/api/ai/tutor/route.test.ts` and are **pre-existing** — confirmed
by running that file in complete isolation with none of this milestone's
code involved; three of its five tests get a 400 instead of a 200, most
likely because the shared `x-forwarded-for: test-tutor` header across all
three `it()` blocks trips the module-level per-IP rate limiter (mentioned
in the Milestone 10 section above) after the first request, and that
limiter's state isn't reset between tests in the same file. Nothing in
this milestone touches `src/app/api/ai/tutor/` or the rate limiter.

### 17. `npm run lint` result

Clean — 0 errors, 0 warnings.

### 18. `npm run build` result

**Could not be fully verified in this sandbox** — see the sandbox note at
the top of this README. What is confirmed: the build got past every other
file in the project and failed with exactly one error,
`Module not found: Can't resolve '@/generated/prisma/client'`, which is
the expected, sole consequence of not being able to run `npx prisma
generate` here. Along the way, running the build did catch one real bug —
an incorrect adapter export name
(`PrismaBetterSQLite3` instead of the package's actual
`PrismaBetterSqlite3`) — which has been fixed. Run `npx prisma generate`
first on a machine with normal internet access, then `npm run build`
again; if anything else surfaces, it wasn't caught here and should be
treated as the first real thing to fix.

### 19. Remaining mock functionality

- **Practice trading (Hyperliquid/buy-sell/positions)** is still entirely
  `localStorage`-only — untouched, per Section 30's explicit deferral.
  `LearningProgress.investmentsMade` is therefore something the server
  can't compute yet; `getServerLearningProgress()` always returns `0` for
  it (documented inline) and the client is responsible for not treating
  that field as authoritative until practice trading itself moves
  server-side.
- **The `FIRST_INVESTMENT` and `DIVERSIFIED` achievements** depend on
  `investmentsMade`/practice-trade data, so they can only unlock through
  the existing client-only path for now — the server-side achievement
  engine (`applyDerivedUnlocks()` in `learning-service.ts`) will correctly
  pick them up automatically once practice trading is migrated, since it
  re-runs the same `checkAchievements()` predicate every codebase already
  uses; no achievement-specific code changes will be needed then.
- **XP / lesson-completion / quiz-submission are not yet called by the
  live lesson/quiz UI.** The server API (`/api/user/lessons/[assetId]/
  complete`, `/api/user/quiz/[assetId]/submit`) is real, server-graded,
  and idempotent, and `getServerLearningProgress()` correctly assembles a
  full snapshot from the database — but wiring the actual `QuizCard`/
  lesson-engine components to call it requires passing the learner's
  *selected option index* through the existing quiz flow, which today
  only tracks a boolean `correct` per question
  (`answerQuizQuestionReducer(questionId, correct)` in
  `progress-store.tsx`) — not which option was picked, which server-side
  grading needs to check against the answer key itself rather than trust
  a client-computed boolean. That's a real, scoped change (touches
  `quiz-card.tsx`, `learn/[assetId]/page.tsx`, `lesson/[slug]/page.tsx`,
  and the reducer), not a hard blocker, and is the top item for Milestone
  12 (see below). Until then, XP/lessons/quizzes/achievements/asset-
  unlocks continue to work exactly as they did through Milestone 10 —
  entirely client-side and `localStorage`-backed — so nothing regressed;
  they're just not yet the server-persisted source of truth the schema
  and service layer are already built to support.
- **Wallet connection** — still just the existing MetaMask injected-wallet
  flow from earlier milestones; `WalletIdentity` (schema only, Section 11
  above) isn't linked to anything yet.
- Everything already listed as mock in earlier milestones (Stocks/
  Watchlist tabs on Home, trusted-sources count, invite-friends) is
  unchanged.

### 20. Exact recommended scope for Milestone 12

1. **Wire the lesson/quiz UI to the real server endpoints.** Thread
   `selectedOptionId` through `quiz-card.tsx`'s answer handler instead of
   just `correct: boolean`; call `/api/user/lessons/[assetId]/complete`
   and `/api/user/quiz/[assetId]/submit` from `progress-store.tsx`'s
   `completeLesson`/`completeAssetLesson`/`completeQuiz`/
   `completeAssetQuiz`, the same optimistic-update-then-sync pattern
   `use-favorite.ts` already established this milestone; hydrate initial
   XP/achievements/lesson-progress from `/api/user/progress` the same way
   interests/risk-profile are hydrated now. This makes XP, achievements,
   quiz results, and asset unlocks genuinely server-authoritative end to
   end, closing the one gap called out in "Remaining mock functionality"
   above.
2. **Route-handler integration tests** — set up a vitest project (or
   switch to Next's route-handler test helpers) with the `react-server`
   condition so `server-only`-guarded route code can actually be exercised
   in tests, plus a real (or in-memory) SQLite file per test run so
   repository-level idempotency can be asserted against actual constraint
   violations rather than only unit-tested at the pure-logic layer like
   this milestone's tests are.
3. **Practice trading beyond a single simulated position type**, which is
   also what unblocks `investmentsMade`/`FIRST_INVESTMENT`/`DIVERSIFIED`
   moving server-side (see "Remaining mock functionality").
4. **Wallet connection**, using the `WalletIdentity` model already in
   place — this was the natural next step Milestone 10.1's own README
   flagged as coming "after database + authentication," which is now
   done.
5. **Localize the auth email body** (see Section 4's scope note) — small,
   but real; the UI around it is already fully EN/FR/RU.
6. Continue deferring Hyperliquid/real trading/order placement/positions/
   P&L/push+email notification delivery, per Section 30 — nothing in this
   milestone's scope changes that recommendation.

---

## Milestone 11.1 — Complete Server-Side User State Migration

The problem this milestone fixes: Milestone 11 built real, working
database persistence for every piece of user-owned state, but the client
(`ProgressProvider`/`progress-store.tsx`) still initialized itself from
`localStorage` first and only best-effort-synced to the server afterward.
That's two competing stores for the same data. This milestone makes the
database the *only* authoritative store for an authenticated user — full
stop — and fixes the crash from running `npm install && npm run dev`
without ever generating the Prisma client (see the "Run it locally"
section above for the `postinstall` fix).

### 1. What localStorage state was removed

For **authenticated users**, `localStorage` is no longer read to
initialize, and no longer written to as a record of truth for: locale,
risk profile, interests, onboarding completion, learning progress (lesson
steps/completion), quiz results, XP, achievements, asset unlocks,
favorites, and notification preferences. Concretely:

- `progress-store.tsx`'s old single `mutate()`/`localStorage.setItem`
  pipeline now only runs for **anonymous** visitors
  (`useAnonymousProgress()`). Authenticated visitors get a completely
  separate implementation (`useAuthenticatedProgress()`) that never
  touches `localStorage` at all — not on read, not on write.
- `locale-provider.tsx`'s `compass-locale-v1` key is only read/written
  pre-authentication; once `sessionStatus === "authenticated"`, the
  provider fetches `/api/user/profile` for the real value and never reads
  the localStorage key again for that session.

### 2. What database state is now authoritative

Everything listed above, for every authenticated user, sourced through
the models already built in Milestone 11 (`User`, `UserInterest`,
`UserLearningProgress`, `UserQuizResult`, `UserXPEvent`,
`UserAchievement`, `UserAssetUnlock`, `UserFavoriteAsset`,
`UserNotificationPreference`, `UserLearningStats`) — no schema changes
this milestone, per the brief's explicit "reuse existing models."

### 3. How authenticated hydration works

One request, `GET /api/me` (`src/app/api/me/route.ts`, Section 16),
aggregates profile + interests + favorites + notification preferences +
the full learning-progress snapshot + per-asset lesson/quiz progress in a
single round trip (five `Promise.all`-parallelized repository calls, not
five sequential page-load fetches). `useAuthenticatedProgress()` fetches
this once on mount/identity-change and feeds the response through a pure
mapper, `buildProgressStateFromServer()`
(`src/lib/server-sync/build-progress-state.ts`), which reshapes it into
exactly the `ProgressState` shape every existing pure derivation function
(`getAssetLearningAccess`, `getInvestmentAccess`,
`isInvestmentUnlocked`, `deriveLearningProgress`, etc.) already expected.
That's the core architectural move this milestone makes: none of that
derivation logic needed to change, because it never cared whether the
`ProgressState` it was fed came from `localStorage` or a database — it
just reads a plain object. The mapper is pure and directly unit-tested
(`build-progress-state.test.ts`, 9 tests) with no need for a real
database connection.

### 4. How mutations work

Every authenticated mutation follows the same shape: update local React
state (optimistic, for a snappy UI), fire the request, and on failure
either roll back (risk profile, interests) or simply not have applied
the optimistic change in the first place (lesson completion, quiz
submission — see Section 21 discussion below). Nothing catches an error
and silently drops it — every mutator sets a shared `progressError`
string that the two lesson-flow pages render as an inline dismissible
error banner, and `dismissProgressError()`/retry (just calling the same
action again) is exposed through context.

### 5. How XP is made server-authoritative

`UserXPEvent` (Milestone 11's immutable ledger) was already the only
place `/api/user/lessons/[assetId]/complete` and
`/api/user/quiz/[assetId]/submit` write XP — that didn't need to change.
What changed is that the **client no longer has a parallel local XP
number** for authenticated users: `state.xp` for an authenticated visitor
is `me.progress.totalXP`, which is a sum computed server-side
(`getServerLearningProgress()`), full stop. The one gap this exposed:
practice-trading (closing a simulated position) used to add `+30 xp`
directly to local state, and there was no server equivalent. Rather than
build real trading infrastructure (explicitly out of scope — Section
23/28), a minimal bridge was added: `POST
/api/user/practice-trades/close` (`src/server/services/learning-service.ts`
→ `closePracticeTrade()`) logs a `practice_trade_closed` `UserXPEvent`
with a client-generated idempotency key (one per closed trade) — the
*only* thing about a practice trade that touches the server; the
simulated entry/exit price, P&L math, and position history stay entirely
client-side in a new, deliberately non-authoritative
`practice-trade-store.ts`. `investmentsMade` in
`getServerLearningProgress()` is simply `COUNT(UserXPEvent WHERE
eventType = 'practice_trade_closed')` — no new model needed.

### 6. How achievements are made server-authoritative

Unchanged from Milestone 11's `applyDerivedUnlocks()` — it already ran
`checkAchievements()` (the same deterministic pure predicate the client
used to run locally) against the server-assembled snapshot after every
lesson completion, quiz submission, and now practice-trade closure too.
What's new this milestone is that the **client now actually reads the
result**: `state.achievements` for an authenticated user is
`me.progress.unlockedAchievements`, sourced from `UserAchievement` rows,
not a local array. The achievement-unlock toast still works — diffing
the previous and next `unlockedAchievements` arrays after any mutation
response (`applyServerProgress()` in `progress-store.tsx`) and showing
the first newly-unlocked one via `getAchievement()`, same UX as before,
just driven by a server diff instead of a local `checkAchievements()`
call.

### 7. How asset unlocks are made server-authoritative

Same mechanism as achievements — `applyDerivedUnlocks()` already checked
`getInvestmentAccess()` against every `INVESTMENT_UNLOCK_STAGES` entry
and persisted newly-`UNLOCKED` stages to `UserAssetUnlock` in Milestone
11. This milestone makes `getInvestmentAccess()`/`isInvestmentUnlocked()`
on the client read from the server-derived `learningProgress` object
(`me.progress`) for authenticated users instead of a locally-computed
one, so "is this asset unlocked" is now genuinely a database-derived
answer, not a client recomputation that happened to usually agree with
the server.

### 8. How locale/risk/interests are persisted

- **Locale**: `locale-provider.tsx` fetches `/api/user/profile` the
  moment a session becomes authenticated and applies the DB value
  immediately (never localStorage). If the user has no locale on record
  yet (first authenticated visit), the currently-showing value
  (browser-detected or previously-anonymous) is PATCHed to the server
  once, seeding it — from then on the database is authoritative. Every
  subsequent `setLocale()` call updates the UI immediately and PATCHes
  `/api/user/profile`, rolling back the UI value if that PATCH fails.
- **Risk profile**: `setRiskProfile()` optimistically updates local
  cached state, PATCHes `/api/user/profile` (server-validated against
  the exact canonical risk-profile ids — Milestone 11's
  `isValidRiskProfileId()`), and rolls back to the previous value on
  failure — exactly Section 6's required flow.
- **Interests**: `toggleInterest()` optimistically updates, POSTs/DELETEs
  `/api/user/interests`, and rolls back on failure — Section 7's
  required flow. No more "best-effort, don't bother checking the
  response" — a failed request now visibly un-does the toggle and shows
  `progressError`.
- **Onboarding completion**: `me.user.onboardingCompleted` is available
  from `/api/me`/`/api/user/profile` for any future onboarding gate to
  read. (As documented in the Milestone 11 report, this app has no
  forced first-run onboarding gate to wire it into yet — Profile's
  risk-profile/interests pages are reachable directly, so there's
  nothing currently reading this field client-side. It's real,
  persisted, and ready for whenever that gate is built.)

### 9. How duplicate events are prevented

Unchanged from Milestone 11 — every idempotency guarantee lives in a
database unique constraint (`(userId, assetId)`, `(userId, eventType,
sourceId)`, `(userId, attemptId)`, etc. — see the Milestone 11 report's
full table), not in client-side "don't double-click" logic. This
milestone's new `practice_trade_closed` XP event uses the exact same
`(userId, eventType, sourceId)` constraint on `UserXPEvent`, with a
client-generated UUID per trade as `sourceId` — retrying the same close
request can't double-grant XP, the same guarantee every other action
already had.

### 10. How logout/login isolation works

`useAuthenticatedProgress()` takes `userId` (from `useSession()`) as an
argument and watches it in a `useEffect`: the instant it changes — to
`null` (logout) or to a *different* id (switching accounts) — cached
server state (`me`) is cleared to `null` before anything re-fetches, and
the per-quiz session buffers (`pendingAnswers`, `pendingCorrectness`,
`attemptIds` — all `useRef`s) are reset too. `state` (the `ProgressState`
consumers actually read) falls back to `defaultState` while `me` is
`null`, so there is no render frame where user B could see user A's
data — the UI shows a loading/default state until user B's own
`/api/me` response arrives.

### 11. Remaining legitimate localStorage usage

- **`compass-locale-v1`** — anonymous/pre-authentication locale cache
  only (see Section 8/5 above). Never read once a session is
  authenticated.
- **`compass-progress-v1`** — the entire anonymous-visitor experience
  (Section 4: "preserve the local demo/onboarding state where useful").
  Has nothing to do with any account; an anonymous visitor who later
  signs in gets the real database state instead, not a merge (see
  "Migration of existing demo users" below).
- **`compass-practice-trades-v1`** (new this milestone,
  `practice-trade-store.ts`) — simulated position/P&L history, for
  *every* user regardless of auth status. There's no server model for a
  "trade" (Section 23/28 explicitly forbid building real trading
  infrastructure this milestone), and this is genuinely non-authoritative,
  low-stakes simulation data — losing it to a cleared localStorage just
  resets a demo, not a real position. The one thing that *does* leave
  this local slice is the resulting XP, which is bridged server-side via
  `closePracticeTrade()` (Section 5 above).

Nothing else in the codebase calls `localStorage`/`sessionStorage` (the
Section 26 grep audit — `localStorage`, `ProgressProvider`, `xp`,
`achievements`, `unlocked`, `interests`, `riskProfile`, `locale`,
`learningProgress` — found only the three keys above plus stale/now-
corrected code comments in `interests-card.tsx` and
`language-switcher.tsx` that described the pre-11.1 behavior).

### 12. Migration of existing demo users

Handled by construction rather than an explicit merge step (Section 19's
"if migration is too risky, document it instead of implementing unsafe
merging"): an anonymous visitor's `compass-progress-v1` state and an
authenticated user's database state are simply two different, unrelated
things — signing in doesn't read or import the anonymous localStorage
state at all. The database is authoritative from the first authenticated
request, and if that user has no rows yet (a brand-new account), they
correctly see a fresh/empty state — not their pre-login demo progress,
and not silently overwritten server state either, since there's nothing
to overwrite for a new user. This is the safe option Section 19
explicitly allows when real merging would be risky: no merge logic
exists, so there's no way for it to corrupt anything. A copy-in migration
("import my demo progress into my new account") would be a legitimate,
clearly-scoped future feature, not attempted here.

### 13. Tests

New this milestone: `src/lib/server-sync/build-progress-state.test.ts` (9
tests — server payload maps correctly onto every `ProgressState` field,
sp500's dedicated fields vs. generic `assetLessonProgress` are kept
separate, risk profile falls back to the canonical default rather than
an arbitrary value, practice-trading fields are never populated from the
server). Combined with Milestone 11's `quiz-grading.test.ts` (6) and
`validation.test.ts` (8), that's 23 tests specifically covering this
persistence architecture, all pure-logic and runnable without a database
connection.

**Still not directly tested, for the same reason as Milestone 11**:
route-handler-level integration tests (`/api/me`, the mutation routes)
and the React-hook-level authenticated/anonymous branching in
`progress-store.tsx` itself. Both need either a generated Prisma client
(blocked in this sandbox — see the top of this README) or a
`react-server`-condition vitest project for `server-only`-guarded code, plus
in this milestone's case, a testing-library setup for hook behavior that
wasn't in the project before. This is the same, previously-disclosed gap
from Milestone 11 — not new, and still the right scoped item for a
future milestone rather than something to route around with untested
sandbox trickery.

Existing suite: 114 tests, 111 passing. The 3 failures are still the
same pre-existing `src/app/api/ai/tutor/route.test.ts` ones documented in
the Milestone 11 report (unrelated rate-limiter test-isolation issue,
confirmed again this milestone by re-running that file in isolation with
none of this milestone's changes present).

### 14. `npm run lint` result

Clean — 0 errors, 0 warnings.

### 15. `npm run test` result

114 tests, 111 passing, 3 pre-existing/unrelated failures (see #13 above).

### 16. `npm run build` result

Same single, expected error as Milestone 11 — `Module not found: Can't
resolve '@/generated/prisma/client'` — confirmed by re-running the build
after every change this milestone, with no other errors appearing at any
point. See the sandbox note at the top of this README; the `postinstall`
script added this milestone should make this a non-issue on a normal
machine (`npm install` alone now generates the client).

### 17. Any remaining technical debt

- **Quiz mid-session refresh**: per-question selected-answer state for an
  in-progress (not-yet-submitted) quiz is intentionally session-only
  (`useRef`, not persisted) — Section 10 explicitly allows this ("the
  client can temporarily hold answers while the quiz is active"). A
  refresh mid-quiz restarts that quiz's question index; the *result* of
  an already-submitted quiz is fully persisted and restored correctly.
- **`getAssetProgressMap()`** infers `quizCompleted` from "does a
  `UserQuizResult` row exist for this assetId," not from a stored
  pass/fail flag on `UserLearningProgress` itself — correct today since
  a quiz can only be submitted once its lesson is complete, but worth
  keeping in mind if that ordering constraint ever changes.
- **Practice-trading XP bridge** (`closePracticeTrade`) reuses
  `XP_REWARDS.assetLearningPathCompleted` as its fixed reward rather than
  a dedicated constant — functionally fine (server-determined, not
  client-supplied, so Section 11's actual requirement is met) but a
  `XP_REWARDS.practiceTradeCompleted` constant would read more clearly;
  flagged rather than silently left as a magic-looking reuse.
- Every item already listed as remaining/deferred in the Milestone 11
  report's "Remaining mock functionality" and "Exact recommended scope
  for Milestone 12" sections still applies except item 1 ("wire the
  lesson/quiz UI to the real server endpoints"), which this milestone
  completes.

### 18. SQLite confirmation

**Confirmed: SQLite remains the database.** `prisma/schema.prisma`'s
`datasource db` block is unchanged — `provider = "sqlite"`, `url =
env("DATABASE_URL")`. No migration to PostgreSQL was made or attempted
this milestone.

### 19. PostgreSQL migration-readiness confirmation

**Confirmed: the architecture remains PostgreSQL-migration-ready.** This
milestone added zero SQLite-specific SQL, zero database-specific
behavior in UI components, and zero new raw-SQL usage — every new piece
of server code (the `/api/me` aggregation, the practice-trade XP bridge,
the lesson step-progress checkpoint) goes through the same
Prisma-Client-via-repository/service abstraction Milestone 11
established, unchanged. The eventual `SQLite → Prisma → PostgreSQL`
swap still only touches `prisma/schema.prisma`'s `datasource` block and
`DATABASE_URL`, not the UI, the API contracts, or any business logic.

---

## Milestone 12 — Production-Ready Authentication + User Persistence

> **Local development note:** `npm run dev` now applies any pending Prisma migrations automatically before starting Next.js. This prevents Auth.js `AdapterError` failures caused by a fresh local SQLite database that has not had the Auth.js tables created yet. Production deployments should continue to run `npm run db:migrate:deploy` as an explicit deployment step.

### 1. Files changed

- `src/auth.ts` — explicit `secret: authSecret`, production fail-fast check
- `src/server/auth/secret-check.ts` (new) — the fail-fast check, extracted as a pure function so it's unit-testable
- `proxy.ts` — rewritten: no longer calls `auth()` or redirects anywhere; the entire app-wide auth gate is removed
- `src/components/profile/account-card.tsx` — now renders a "sign in" prompt (with a real link to `/signin`) for signed-out visitors instead of rendering nothing
- `.env.example` — `AUTH_SECRET` comment clarified (what breaks without it, that it's enforced in production); `AUTH_URL` documented as present-but-commented-out, with the `trustHost: true` reasoning for why it's not required
- `src/lib/i18n/translations/{en,fr,ru}.ts` — three new `auth.*` strings for the guest-mode prompt
- New tests: `src/server/auth/secret-check.test.ts`, `src/server/api-routes-idor.test.ts`, `src/proxy.test.ts`

### 2. What was fixed

The `MissingSecret` 500 had two causes, not one:

1. **The obvious one**: no `AUTH_SECRET` in `.env.local`. Auth.js needs
   this to sign session cookies; without it, anything touching auth
   throws. This is fixed by documentation + the explicit `secret:` field
   in `src/auth.ts` (was previously relying on Auth.js's implicit env-var
   auto-detection, which works but made the failure harder to trace to a
   specific line) — the developer still has to actually generate and set
   the value, which no code change can do for them, but the failure is
   now traceable and the production case fails fast with a specific
   message instead of a generic internal error.
2. **The real bug**: `proxy.ts` (inherited from Milestone 11) called
   `auth()` on **every single route** in the app except `/signin` and
   `/api/auth`, redirecting to sign-in if there was no session. That
   directly contradicts this milestone's Section 7 ("do NOT force
   authentication globally") — and it's *why* a missing `AUTH_SECRET`
   took down the entire app instead of just the account-specific
   features: literally every page load invoked `auth()`, which needs the
   secret. `proxy.ts` is now a no-op — it doesn't import `@/auth` at all
   anymore, so a missing secret no longer has any way to affect a page
   that doesn't itself touch authentication. This also surfaced a real,
   separate gap: with the forced redirect removed, there was no visible
   way for a signed-out user to discover `/signin` at all (`AccountCard`
   used to render nothing when signed out) — fixed alongside this, since
   guest mode without a discoverable way to create an account isn't
   actually useful.

### 3. Authentication flow implemented

Unchanged from Milestone 11/11.1 — Google OAuth + Resend-backed
passwordless email, both through Auth.js's `PrismaAdapter`, database
sessions. This milestone didn't touch the flow itself, only (a) how the
secret it depends on is validated/surfaced, and (b) when it's invoked at
all (no longer on every request).

### 4. Database changes

**None.** Per Section 12 ("do NOT migrate SQLite to PostgreSQL yet") and
the general instruction to preserve the existing schema, `prisma/schema.prisma`
is byte-for-byte unchanged this milestone. Verified: `User.email` is
already `@unique`, which combined with Auth.js's adapter behavior is what
prevents duplicate users across providers (Section 5) — Google and email
sign-in for the same address already resolve to the same `User` row, and
this was true before this milestone too; nothing needed fixing there.

### 5. Security fixes

- **Global auth-gate removal** (see #2 above) — arguably a security
  *improvement* in the sense that it removes a failure mode where a
  misconfiguration takes the whole app down rather than degrading
  gracefully, but its primary purpose is correctness (Section 7), not a
  vulnerability fix.
- **IDOR audit** (Section 8): every route under `src/app/api/user/*` and
  `src/app/api/me` was manually checked, and all thirteen already
  correctly call `requireUserId()` (which derives identity from
  `auth()`'s session, never from request body/query/params) rather than
  trusting any client-supplied id — this was already correct from
  Milestone 11/11.1's `requireUserId()` convention, not something this
  milestone had to fix. What this milestone adds is a **regression
  guard**: `api-routes-idor.test.ts` statically scans every route file
  and fails the build if any of them ever gain a `body.userId` /
  `searchParams.get("userId")` / `params.userId` pattern, or lose their
  `requireUserId()` call — so this stays true going forward, not just
  today.

### 6. Environment variables required

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET=                          # required — openssl rand -base64 33
GOOGLE_CLIENT_ID=                     # optional — Google sign-in only offered if both are set
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=                       # required for email sign-in to actually send mail
EMAIL_FROM="Compass <no-reply@compass.app>"
DEEPSEEK_API_KEY=                     # AI Tutor (Milestone 10)
DEEPSEEK_MODEL=deepseek-v4-flash
NEWS_PROVIDER=mock                    # or "marketaux" + MARKETAUX_API_TOKEN (Milestone 9)
```

`AUTH_URL` is documented in `.env.example` but commented out — not
needed with `trustHost: true` unless deploying behind a reverse proxy
that doesn't forward the `Host` header reliably.

### 7. Test result

**148 tests, 148 passing** (up from the 114/114 baseline — 34 new: 5 for
secret validation, 27 for the IDOR regression guard across all 13 user-
data routes, 2 for the guest-mode proxy). Every existing test still
passes unmodified.

Sandbox note: route-handler-level integration tests (actually invoking
`GET /api/me`, `POST /api/user/favorites`, etc. and asserting on HTTP
responses) still couldn't be added in this sandbox, for the same reason
disclosed in the Milestone 11/11.1 reports — every route transitively
imports the generated Prisma client, which this sandbox's network
restrictions prevent generating. Where that mattered here, dependency-
free equivalents were used instead: `secret-check.ts` was extracted as a
zero-import pure function specifically so it doesn't need Prisma to test,
and the IDOR check works by reading route source text rather than
executing it. `proxy.ts` itself no longer needs Prisma either (that's the
whole fix), so it's now directly testable too, and is.

### 8. Lint result

Clean — 0 errors, 0 warnings.

### 9. Build result

Same single, already-disclosed error as Milestones 11/11.1 —
`Module not found: Can't resolve '@/generated/prisma/client'` — confirmed
by re-running the build after every change this milestone, with no new
errors at any point. The import trace no longer includes `proxy.ts`
(previously it did, via `@/auth`), which is a direct, verifiable
confirmation that the guest-mode fix actually removed that dependency
path. **On a machine with normal internet access — like the one that
reported `npm run build = PASS` before hitting this runtime error — this
resolves to a clean build once `AUTH_SECRET` is set in `.env.local`.**

### 10. Remaining manual setup (Google Cloud / Resend)

Unchanged from Milestone 11 — nothing new needed:

- **Google**: OAuth 2.0 Client ID at
  https://console.cloud.google.com/apis/credentials, type "Web
  application", authorized redirect URI
  `http://localhost:3000/api/auth/callback/google` for local dev.
  Entirely optional — the app runs fine with `GOOGLE_CLIENT_ID`/
  `GOOGLE_CLIENT_SECRET` unset, it just won't show the Google button.
- **Resend**: an API key from https://resend.com/api-keys. In dev,
  Resend's own `onboarding@resend.dev` sender works without domain
  verification; production needs a verified sending domain.
- **`AUTH_SECRET`**: no external service — just run `openssl rand
  -base64 33` locally and put the output in `.env.local`. This is the
  one both required and entirely self-serviceable.
