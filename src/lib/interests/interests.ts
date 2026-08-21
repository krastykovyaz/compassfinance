// Investor Interests (Milestone 9, Part 4).
//
// Deliberately a SEPARATE concept from risk-profile/risk-profiles.ts:
// risk profile answers "how much risk am I comfortable taking", interests
// answer "what do I want to follow and learn about". Nothing here reads
// or writes RiskProfileId, and nothing in risk-profiles.ts reads this
// file — see progress-store.tsx's setRiskProfile()/toggleInterest(),
// which are two entirely separate, non-mutate() setState calls.
//
// Pure data + pure functions only — no React, no persistence. The
// persisted `interests: InterestCategoryId[]` field lives on ProgressState
// (src/lib/learning/state.ts) alongside riskProfileId, and
// progress-store.tsx owns hydration/persistence for it, same as every
// other field there.

import { NewsCategory, NewsItem } from "@/lib/news/news-types";

export type InterestCategoryId =
  | "TECH_AI"
  | "STOCKS"
  | "CRYPTO"
  | "COMMODITIES"
  | "ENERGY"
  | "MARKET_INDICES"
  | "IMPACT_ESG";

export type InterestCategoryDefinition = {
  id: InterestCategoryId;
  /** i18n key under interests.* in the translation dictionaries. */
  labelKey: string;
  /** Tickers/entities this interest should prioritize in news & explore.
   * Kept independent of news/news-types.ts's COMPASS_ASSET_SYMBOLS since
   * an interest can span symbols Compass doesn't have an asset page for
   * yet (e.g. commodities/energy tickers) — this is about relevance
   * ranking, not asset unlocking. */
  relatedSymbols: string[];
  /** News categories (see news-types.ts's NewsCategory) this interest maps to. */
  relatedNewsCategories: NewsCategory[];
  /** Keywords used as a last-resort heuristic match against title/description
   * for interests with no clean symbol list (e.g. ESG). Mirrors the same
   * kind of local heuristic news-types.ts already uses for categorization —
   * not guaranteed-accurate, just a reasonable approximation. */
  keywords: string[];
};

// Extensible on purpose (Part 4, item 11): this is a plain array of typed
// records, not something hardcoded into any component's JSX — adding a
// category is a one-entry change here, nothing else.
export const INTEREST_CATEGORIES: InterestCategoryDefinition[] = [
  {
    id: "TECH_AI",
    labelKey: "interests.technologyAI",
    relatedSymbols: ["AAPL", "NVDA", "MSFT", "GOOGL", "META"],
    relatedNewsCategories: [],
    keywords: ["ai", "artificial intelligence", "chip", "semiconductor", "software"],
  },
  {
    id: "STOCKS",
    labelKey: "interests.stocks",
    relatedSymbols: ["AAPL", "NVDA", "MSFT", "GOOGL", "META", "TSLA", "AMZN"],
    relatedNewsCategories: ["stocks", "earnings"],
    keywords: [],
  },
  {
    id: "CRYPTO",
    labelKey: "interests.crypto",
    relatedSymbols: ["BTC", "ETH"],
    relatedNewsCategories: ["crypto"],
    keywords: ["crypto", "bitcoin", "ethereum"],
  },
  {
    id: "COMMODITIES",
    labelKey: "interests.commodities",
    relatedSymbols: ["GOLD", "XAU", "BRENT", "OIL", "CL"],
    relatedNewsCategories: [],
    keywords: ["gold", "oil", "commodity", "commodities"],
  },
  {
    id: "ENERGY",
    labelKey: "interests.energy",
    relatedSymbols: ["BRENT", "OIL", "CL", "XOM", "CVX"],
    relatedNewsCategories: [],
    keywords: ["energy", "oil", "gas", "renewable"],
  },
  {
    id: "MARKET_INDICES",
    labelKey: "interests.marketIndices",
    relatedSymbols: ["SPX", "SPY", "NDX", "QQQ", "DJI", "DIA"],
    relatedNewsCategories: ["indices"],
    keywords: [],
  },
  {
    id: "IMPACT_ESG",
    labelKey: "interests.impactESG",
    relatedSymbols: [],
    relatedNewsCategories: [],
    keywords: ["esg", "sustainab", "climate", "impact investing"],
  },
];

export function getInterestCategory(id: InterestCategoryId): InterestCategoryDefinition | undefined {
  return INTEREST_CATEGORIES.find((c) => c.id === id);
}

/**
 * Scores one news item against a user's selected interests. Higher is
 * more relevant. 0 means "no interest signal either way" — NOT "hide
 * this", since the brief is explicit that the goal is personalization,
 * not hiding the entire market (Part 4, item 14).
 */
export function scoreNewsItemForInterests(
  item: NewsItem,
  selected: InterestCategoryId[]
): number {
  if (selected.length === 0) return 0;

  const symbols = new Set(item.symbols.map((s) => s.toUpperCase()));
  const haystack = `${item.title} ${item.description}`.toLowerCase();

  let score = 0;
  for (const id of selected) {
    const def = getInterestCategory(id);
    if (!def) continue;
    if (def.relatedNewsCategories.includes(item.category)) score += 2;
    if (def.relatedSymbols.some((sym) => symbols.has(sym))) score += 3;
    if (def.keywords.some((kw) => haystack.includes(kw))) score += 1;
  }
  return score;
}

/**
 * Stable-sorts an already-fetched, already-filtered news batch so items
 * matching the user's interests surface first — a simple deterministic
 * ranking, not a recommendation engine, and nothing is removed (Part 4,
 * item 14: "do not remove unrelated news completely").
 */
export function sortNewsByInterest(items: NewsItem[], selected: InterestCategoryId[]): NewsItem[] {
  if (selected.length === 0) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreNewsItemForInterests(item, selected) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map((entry) => entry.item);
}

/**
 * Scores an Explore theme/track by matching its id against interest
 * keywords — deliberately loose (substring match on the id/label) since
 * Explore's mock themes ("tech", "ai-robotics", "clean-energy"...) don't
 * share a symbol vocabulary with news the way NewsItem does. Same
 * deterministic-ranking approach as sortNewsByInterest(), reused for
 * Explore recommendations per Part 4, item 14.
 */
export function scoreExploreThemeForInterests(
  themeId: string,
  selected: InterestCategoryId[]
): number {
  if (selected.length === 0) return 0;
  const THEME_TO_INTERESTS: Record<string, InterestCategoryId[]> = {
    tech: ["TECH_AI"],
    "ai-robotics": ["TECH_AI"],
    "clean-energy": ["ENERGY", "IMPACT_ESG"],
    healthcare: ["IMPACT_ESG"],
    consumer: ["STOCKS"],
  };
  const mapped = THEME_TO_INTERESTS[themeId] ?? [];
  return mapped.filter((id) => selected.includes(id)).length;
}

export function sortThemesByInterest<T extends { id: string }>(
  themes: T[],
  selected: InterestCategoryId[]
): T[] {
  if (selected.length === 0) return themes;
  return themes
    .map((theme, index) => ({
      theme,
      index,
      score: scoreExploreThemeForInterests(theme.id, selected),
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map((entry) => entry.theme);
}
