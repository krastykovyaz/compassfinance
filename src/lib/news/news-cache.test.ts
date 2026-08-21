import { describe, expect, it, vi } from "vitest";
import type { NewsItem } from "./news-types";

// news-cache.ts intentionally persists its cache on globalThis (to survive
// Next.js dev-mode hot reloads — see that file's own comment), which means
// vi.resetModules() alone does NOT give a fresh cache between tests: the
// globalThis keys survive the module reload. Clearing them explicitly is
// what actually isolates each test.
function resetGlobalCache() {
  const g = globalThis as unknown as {
    __compassNewsCache?: unknown;
    __compassNewsInFlight?: unknown;
  };
  delete g.__compassNewsCache;
  delete g.__compassNewsInFlight;
}

async function freshNewsCache() {
  resetGlobalCache();
  vi.resetModules();
  return import("./news-cache");
}

// Fixed publishedAt — not `new Date().toISOString()` — so equality
// assertions don't flake against fake-timer advancement between when an
// item is queued as a mock result and when it's asserted on.
function item(id: string): NewsItem {
  return {
    id,
    title: `Headline ${id}`,
    description: "",
    source: "Reuters",
    url: "https://example.com",
    imageUrl: null,
    publishedAt: "2024-01-01T00:00:00.000Z",
    symbols: [],
    entities: [],
    category: "general",
  };
}

describe("getOrFetchNews — real fresh/stale cache behavior", () => {
  it("calls the fetcher and caches the result on a cold cache", async () => {
    const { getOrFetchNews } = await freshNewsCache();
    const fetchFn = vi.fn().mockResolvedValue([item("1")]);

    const result = await getOrFetchNews(fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([item("1")]);
    expect(result.fromCache).toBe(false);
    expect(result.servedStaleAfterError).toBe(false);
  });

  it("serves from cache without re-fetching while still fresh", async () => {
    const { getOrFetchNews } = await freshNewsCache();
    const fetchFn = vi.fn().mockResolvedValue([item("1")]);

    await getOrFetchNews(fetchFn);
    const second = await getOrFetchNews(fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1); // not called again
    expect(second.fromCache).toBe(true);
    expect(second.items).toEqual([item("1")]);
  });

  it("re-fetches once the cached entry is past the TTL", async () => {
    vi.useFakeTimers();
    try {
      const { getOrFetchNews, NEWS_CACHE_TTL_MS } = await freshNewsCache();
      const fetchFn = vi.fn().mockResolvedValueOnce([item("1")]).mockResolvedValueOnce([item("2")]);

      await getOrFetchNews(fetchFn);
      vi.advanceTimersByTime(NEWS_CACHE_TTL_MS + 1);
      const second = await getOrFetchNews(fetchFn);

      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(second.fromCache).toBe(false);
      expect(second.items).toEqual([item("2")]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the stale real cache when a refresh attempt fails, and flags it", async () => {
    vi.useFakeTimers();
    try {
      const { getOrFetchNews, NEWS_CACHE_TTL_MS } = await freshNewsCache();
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce([item("1")])
        .mockRejectedValueOnce(new Error("upstream down"));

      await getOrFetchNews(fetchFn);
      vi.advanceTimersByTime(NEWS_CACHE_TTL_MS + 1);
      const second = await getOrFetchNews(fetchFn);

      // Stale REAL data, never fabricated data — and clearly flagged as
      // degraded so the API route/UI can show the "showing recent news"
      // note instead of pretending it's fresh.
      expect(second.items).toEqual([item("1")]);
      expect(second.fromCache).toBe(true);
      expect(second.servedStaleAfterError).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws when the fetch fails and there is no cache to fall back to", async () => {
    const { getOrFetchNews } = await freshNewsCache();
    const fetchFn = vi.fn().mockRejectedValue(new Error("upstream down"));

    await expect(getOrFetchNews(fetchFn)).rejects.toThrow("upstream down");
  });

  it("dedupes concurrent cold-cache callers into a single upstream request", async () => {
    const { getOrFetchNews } = await freshNewsCache();
    const fetchFn = vi.fn().mockResolvedValue([item("1")]);

    // Both calls are issued before either settles — the first call's
    // synchronous-until-its-first-await span registers the shared
    // in-flight promise before the second call's continuation ever runs
    // (both queue behind the same cache.get() microtask), so this
    // deterministically dedupes without needing manual timer control.
    const [firstResult, secondResult] = await Promise.all([
      getOrFetchNews(fetchFn),
      getOrFetchNews(fetchFn),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(firstResult.items).toEqual([item("1")]);
    expect(secondResult.items).toEqual([item("1")]);
  });
});
