import type { NewsItem } from "@/lib/news/news-types";

/**
 * The real, distinct publisher names present in an actual fetched news
 * item list, alphabetized. Single source of truth for both the Profile
 * page's count and the Trusted Sources list page below — neither
 * duplicates this logic.
 */
export function getDistinctSourceNames(items: NewsItem[]): string[] {
  return [...new Set(items.map((item) => item.source))].sort((a, b) => a.localeCompare(b));
}

/**
 * The real "trusted sources" count: distinct publisher names present in
 * an actual fetched news item list. This app has no separate curated
 * source registry — rather than inventing one or showing a hardcoded
 * number, Profile derives this from the same real news data the News
 * screen and Home's Insight card already fetch, so it updates
 * automatically whenever that data does and never needs its own state.
 */
export function countDistinctSources(items: NewsItem[]): number {
  return getDistinctSourceNames(items).length;
}
