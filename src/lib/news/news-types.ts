// Shared types for the news abstraction layer.
//
// The rest of Compass (UI, future LLM enrichment, future per-asset news)
// depends only on NewsItem — never on a raw provider response shape. This
// is what lets us swap Marketaux for another provider, or add one, without
// touching the News screen.

export type NewsCategory = "stocks" | "indices" | "crypto" | "earnings" | "general";

export type NewsItem = {
  id: string;
  title: string;
  description: string;
  source: string;
  url: string;
  imageUrl: string | null;
  /** ISO 8601 timestamp string. */
  publishedAt: string;
  /** Tickers this article is tagged with, e.g. ["NVDA"]. */
  symbols: string[];
  /** Human-readable entity names mentioned, e.g. ["NVIDIA Corp"]. */
  entities: string[];
  category: NewsCategory;
};

export interface NewsProvider {
  id: "marketaux" | "mock";
  /**
   * Fetch the latest broad financial news (a real provider may page
   * through several requests internally to build one batch, e.g. a plan
   * that caps articles-per-request — see marketaux-provider.ts). Whatever
   * it returns is one already-complete batch: category/symbol filtering
   * happens afterwards, in-process, against it — never by issuing another
   * request per category/symbol.
   */
  getLatestNews(): Promise<NewsItem[]>;
}

// The initial Compass asset universe. Used to (a) bias the single broad
// Marketaux request toward relevant tickers and (b) power
// getNewsBySymbol()-style filtering over an already-fetched batch — never
// to issue a new request per asset.
export const COMPASS_ASSET_SYMBOLS: Record<string, string[]> = {
  sp500: ["SPX", "SPY"],
  nasdaq: ["NDX", "QQQ"],
  dow: ["DJI", "DIA"],
  aapl: ["AAPL"],
  nvda: ["NVDA"],
  msft: ["MSFT"],
  tsla: ["TSLA"],
  btc: ["BTC"],
  eth: ["ETH"],
};

export const ALL_COMPASS_SYMBOLS = Array.from(
  new Set(Object.values(COMPASS_ASSET_SYMBOLS).flat())
);

// Map a news symbol back to a Compass asset slug (for linking to
// /asset/[slug]), shared by the news card and the News Detail page so the
// mapping only lives in one place.
export const SYMBOL_TO_SLUG: Record<string, string> = Object.entries(
  COMPASS_ASSET_SYMBOLS
).reduce<Record<string, string>>((acc, [slug, symbols]) => {
  for (const s of symbols) acc[s.toUpperCase()] = slug;
  return acc;
}, {});

/** Find a single article within an already-fetched batch by its id/uuid. */
export function findNewsById(items: NewsItem[], id: string): NewsItem | undefined {
  return items.find((item) => item.id === id);
}

/** Filter an already-fetched batch to articles tagged with a given asset's tickers. */
export function filterNewsBySlug(items: NewsItem[], slug: string): NewsItem[] {
  const tickers = COMPASS_ASSET_SYMBOLS[slug];
  if (!tickers) return [];
  const set = new Set(tickers.map((t) => t.toUpperCase()));
  return items.filter((item) => item.symbols.some((s) => set.has(s.toUpperCase())));
}

export function filterNewsByCategory(
  items: NewsItem[],
  category: NewsCategory | "all" | "following"
): NewsItem[] {
  if (category === "all") return items;
  if (category === "following") {
    // "Following" = anything tagged with a symbol in Compass's tracked
    // universe. There's no per-user follow list yet, so this is the
    // whole-app equivalent until that exists.
    const set = new Set(ALL_COMPASS_SYMBOLS.map((s) => s.toUpperCase()));
    return items.filter((item) => item.symbols.some((s) => set.has(s.toUpperCase())));
  }
  return items.filter((item) => item.category === category);
}
