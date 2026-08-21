// Server-side cache for translated news batches.
// One cache entry per locale + exact news batch. This prevents a news card
// and its detail page from triggering separate LLM calls. The in-flight map
// also deduplicates concurrent first-open requests (e.g. React Strict Mode).
import { NewsItem } from "./news-types";

const TTL_MS = 20 * 60 * 1000;

type TranslationCacheEntry = {
  items: NewsItem[];
  expiresAt: number;
};

const globalForNewsTranslation = globalThis as unknown as {
  __compassNewsTranslationCache?: Map<string, TranslationCacheEntry>;
  __compassNewsTranslationInFlight?: Map<string, Promise<NewsItem[]>>;
};

const cache =
  globalForNewsTranslation.__compassNewsTranslationCache ??
  new Map<string, TranslationCacheEntry>();
globalForNewsTranslation.__compassNewsTranslationCache = cache;

const inFlight =
  globalForNewsTranslation.__compassNewsTranslationInFlight ??
  new Map<string, Promise<NewsItem[]>>();
globalForNewsTranslation.__compassNewsTranslationInFlight = inFlight;

export function buildNewsTranslationCacheKey(locale: string, items: NewsItem[]): string {
  const batch = items.map((item) => `${item.id}:${item.publishedAt}`).join("|");
  return `${locale}::${batch}`;
}

export function getCachedNewsTranslation(key: string): NewsItem[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.items;
}

export function getNewsTranslationInFlight(key: string): Promise<NewsItem[]> | null {
  return inFlight.get(key) ?? null;
}

export function setNewsTranslationInFlight(key: string, promise: Promise<NewsItem[]>): void {
  inFlight.set(key, promise);
}

export function clearNewsTranslationInFlight(key: string): void {
  inFlight.delete(key);
}

export function setCachedNewsTranslation(key: string, items: NewsItem[]): void {
  cache.set(key, { items, expiresAt: Date.now() + TTL_MS });
}
