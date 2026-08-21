// All mock/demo data for the Compass prototype lives here.
// Nothing in this file talks to a real API, wallet, or database.

import type { AssetCategory } from "@/lib/assets/catalog";

export type ColorKey =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "teal"
  | "rose"
  | "slate";

// Milestone 19: the mock `user` object (hardcoded name "Alex", xp,
// level, streakDays, ...) that used to live here is gone entirely — it
// had already been fully superseded by real sources (the Auth.js session
// for the name — see src/lib/home/greeting.ts and getGreetingParts() —
// and useProgress()'s levelInfo/learningProgress for xp/level/streak) but
// was still silently seeding learning/state.ts's defaultState.xp and
// Explore's streak display. Both were fixed to read the real sources
// instead, which made this object fully dead code.

// The `indices` / `stocks` / `watchlist` mock arrays that used to live
// here (with hardcoded fake prices) are gone as of Milestone 13 — every
// screen that listed tradable assets now derives that list from the
// canonical catalog (src/lib/assets/catalog.ts) and gets real prices from
// the Yahoo Finance service instead. "Watchlist" is now literally the
// user's real, server-persisted favorites (see
// src/lib/favorites/favorites-provider.tsx), not a static subset.

// Milestone 25: Home's "Today's insight" card now reads a real headline
// from the same news pipeline the News screen uses (useNews() ->
// /api/news -> Marketaux, with a mock fallback only on a genuine fetch
// failure — see insight-card.tsx) — not a static string of any kind,
// translated or otherwise.

export const continueLesson = {
  slug: "investing-basics",
  title: "Understanding the S&P 500",
  levelLabel: "Level 4",
  progressPct: 60,
};

export type LearningTrackItem = {
  id: string;
  slug: string;
  title: string;
  moduleCount: number;
  progressPct: number;
  icon: "compass" | "landmark" | "linechart" | "shield";
};

export const learningTracks: LearningTrackItem[] = [
  {
    id: "basics",
    slug: "investing-basics",
    title: "Investing Basics",
    moduleCount: 5,
    // No real lesson content exists for this track yet (only the S&P 500
    // track under "indices" is backed by real progress) — showing a
    // nonzero percentage here would be fake completion, identical for
    // every visitor regardless of activity.
    progressPct: 0,
    icon: "compass",
  },
  {
    id: "stocks",
    slug: "top-us-stocks",
    title: "Top U.S. Stocks",
    moduleCount: 7,
    progressPct: 0,
    icon: "landmark",
  },
  {
    id: "indices",
    slug: "stock-market-indices",
    title: "Stock Market Indices",
    moduleCount: 6,
    progressPct: 20,
    icon: "linechart",
  },
  {
    id: "risk",
    slug: "risk-management",
    title: "Risk Management",
    moduleCount: 5,
    progressPct: 0,
    icon: "shield",
  },
];

export type ThemeItem = {
  id: string;
  label: string;
  icon: "cpu" | "heartpulse" | "bot" | "leaf" | "shoppingbag";
  colorKey: ColorKey;
};

export const themes: ThemeItem[] = [
  { id: "tech", label: "Tech", icon: "cpu", colorKey: "blue" },
  { id: "healthcare", label: "Healthcare", icon: "heartpulse", colorKey: "rose" },
  { id: "ai-robotics", label: "AI & Robotics", icon: "bot", colorKey: "purple" },
  { id: "clean-energy", label: "Clean Energy", icon: "leaf", colorKey: "green" },
  { id: "consumer", label: "Consumer", icon: "shoppingbag", colorKey: "orange" },
];

export type NewsFilter = "all" | "following" | "stocks" | "indices" | "earnings";

export const newsFilters: { id: NewsFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "stocks", label: "U.S. Stocks" },
  { id: "indices", label: "Indices" },
  { id: "earnings", label: "Earnings" },
];

// Real news data lives behind src/lib/news/ (see NewsItem there) and is
// fetched via /api/news — this file no longer carries mock articles.

export type Holding = {
  id: string;
  slug: string;
  name: string;
  symbol: string;
  shares: number;
  value: number;
  changePct: number;
  colorKey: ColorKey;
};

// Milestone 18: the mock `holdings` array (Apple/NVIDIA/Microsoft/SPY/
// Tesla with fake share counts) that used to live here is gone — Portfolio
// now builds its holdings list from the real paper-trading account (see
// src/app/portfolio/page.tsx). The `Holding` type above is still real and
// used by HoldingsList; only the fake data was removed.

// Milestone 17: the old performanceSeries/generateSeries mock sine-wave
// (and the Timeframe/timeframes types that went with it) are gone — Home
// and Portfolio both now build their performance chart from real,
// recorded portfolio-value snapshots via usePerformanceHistory() (see
// src/lib/trading/paper-account-provider.tsx and
// src/lib/trading/types.ts's PerformanceRange).

// Asset detail price charts used to render a seeded-random fake series
// here (getAssetSeries). That's gone — the asset detail page now fetches
// real OHLC candles from Yahoo Finance via useAssetCandles() /
// /api/market/candles instead. See src/lib/market/use-asset-candles.ts.

export const whatMovesIt: Record<
  AssetCategory,
  { label: string; icon: "briefcase" | "percent" | "trending-up" | "bar-chart" }[]
> = {
  index: [
    { label: "Earnings", icon: "briefcase" },
    { label: "Interest rates", icon: "percent" },
    { label: "Inflation", icon: "trending-up" },
    { label: "Economic data", icon: "bar-chart" },
  ],
  stock: [
    { label: "Earnings", icon: "briefcase" },
    { label: "Product news", icon: "trending-up" },
    { label: "Sector trends", icon: "bar-chart" },
    { label: "Analyst ratings", icon: "percent" },
  ],
  commodity: [
    { label: "Supply and demand", icon: "bar-chart" },
    { label: "Inflation", icon: "trending-up" },
    { label: "Geopolitics", icon: "percent" },
    { label: "Currency strength", icon: "briefcase" },
  ],
  crypto: [
    { label: "Adoption", icon: "trending-up" },
    { label: "Regulation", icon: "percent" },
    { label: "Network activity", icon: "bar-chart" },
    { label: "Market sentiment", icon: "briefcase" },
  ],
};

// The practice-position "live" price path used to be a seeded-random fake
// walk here (generatePositionPath). That's gone — the position monitor
// page now polls the real quote via useAssetQuote() and builds its series
// from actually-observed Yahoo Finance prices. See
// src/app/position/[slug]/page.tsx.

export const hyperliquidAccount = {
  connected: true,
  accountLabel: "compass.hl",
  network: "Hyperliquid L1",
};

// Risk profile content now lives in src/lib/risk-profile/risk-profiles.ts,
// and the user's selection is persisted in progress-store.tsx.

export const wallet = {
  address: "0x89...7F2a",
  network: "Arbitrum",
  usdcBalance: 1250.0,
};

// Milestone 24: `followedThemes` (a static demo array, superseded by the
// real per-user interests shown just below on the Profile page) and
// `profileLinks` (hardcoded trusted-sources/connected-accounts/
// notifications summary values) are gone — Profile now reads real data
// for all of these (see src/app/profile/page.tsx and
// src/lib/notifications/use-notification-preferences.ts).
