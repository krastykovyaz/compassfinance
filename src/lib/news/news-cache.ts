// Server-side cache for the news feed.
//
// This is intentionally a small interface, not just a module-level
// variable, so it can be swapped for a real shared store (Redis, Supabase,
// etc.) later without touching the route or provider code. The in-memory
// implementation below is what's wired up for local dev / single-instance
// deployments — see the README for why that's not sufficient once Compass
// runs on multiple serverless instances.

import { NewsItem } from "./news-types";

export const NEWS_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

export type NewsCacheEntry = {
  items: NewsItem[];
  fetchedAt: number;
};

export interface NewsCacheStore {
  get(): Promise<NewsCacheEntry | null>;
  set(entry: NewsCacheEntry): Promise<void>;
}

// --- In-memory implementation -------------------------------------------
//
// Works correctly within a single long-lived Node process (e.g. `next
// start`, a single container, local dev). On multi-instance/serverless
// deployments (e.g. Vercel with multiple lambda instances) each instance
// gets its own copy of this module, so the "one request per 20 minutes"
// guarantee only holds per-instance, not globally. Swap in a Redis-backed
// NewsCacheStore (SET/GET with EX 1200) before relying on this in that kind
// of deployment — the interface above is designed so that's a drop-in
// change with no caller updates.
class InMemoryNewsCache implements NewsCacheStore {
  private entry: NewsCacheEntry | null = null;

  async get(): Promise<NewsCacheEntry | null> {
    return this.entry;
  }

  async set(entry: NewsCacheEntry): Promise<void> {
    this.entry = entry;
  }
}

// Reuse the same instance across hot reloads in dev (Next.js re-evaluates
// modules on each request in dev without this, which would defeat the
// cache and hide bugs in the TTL/dedupe logic while testing locally).
const globalForNewsCache = globalThis as unknown as {
  __compassNewsCache?: InMemoryNewsCache;
  __compassNewsInFlight?: Promise<NewsItem[]> | null;
};

export const newsCacheStore: NewsCacheStore =
  globalForNewsCache.__compassNewsCache ?? new InMemoryNewsCache();
globalForNewsCache.__compassNewsCache = newsCacheStore as InMemoryNewsCache;

/**
 * Returns cached news if it's younger than the TTL. Otherwise calls
 * `fetchFn` exactly once — even if getOrFetch() is invoked concurrently by
 * multiple in-flight requests — normalizes/stores the result, and returns
 * it. This is the thundering-herd guard: concurrent callers share the same
 * in-flight promise instead of each triggering their own upstream request.
 */
export async function getOrFetchNews(
  fetchFn: () => Promise<NewsItem[]>
): Promise<{
  items: NewsItem[];
  fromCache: boolean;
  fetchedAt: number;
  servedStaleAfterError: boolean;
}> {
  const cached = await newsCacheStore.get();
  const isFresh = cached && Date.now() - cached.fetchedAt < NEWS_CACHE_TTL_MS;

  if (cached && isFresh) {
    return {
      items: cached.items,
      fromCache: true,
      fetchedAt: cached.fetchedAt,
      servedStaleAfterError: false,
    };
  }

  if (!globalForNewsCache.__compassNewsInFlight) {
    globalForNewsCache.__compassNewsInFlight = (async () => {
      try {
        const items = await fetchFn();
        await newsCacheStore.set({ items, fetchedAt: Date.now() });
        return items;
      } finally {
        globalForNewsCache.__compassNewsInFlight = null;
      }
    })();
  }

  try {
    const items = await globalForNewsCache.__compassNewsInFlight;
    const entry = await newsCacheStore.get();
    return {
      items,
      fromCache: false,
      fetchedAt: entry?.fetchedAt ?? Date.now(),
      servedStaleAfterError: false,
    };
  } catch (err) {
    // Upstream fetch failed. Fall back to stale cache if we have any,
    // rather than surfacing the raw error to callers.
    if (cached) {
      return {
        items: cached.items,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
        servedStaleAfterError: true,
      };
    }
    throw err;
  }
}
