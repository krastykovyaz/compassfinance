// Generic keyed TTL cache with in-flight-request dedupe, used by
// market-service.ts so repeated renders (or several users loading the
// same asset at once) never fan out into more than one upstream Yahoo
// Finance request per key per TTL window.
//
// Same design as src/lib/news/news-cache.ts (single in-memory store,
// reused across hot reloads via globalThis, one shared in-flight promise
// per key) — deliberately not shared code with that file since the two
// caches have different key shapes (news has exactly one entry; this one
// is keyed per instrument/range), but the pattern is intentionally
// consistent so the two are easy to reason about together.
//
// Known limitation, same as news-cache.ts: this is per-process. On a
// multi-instance/serverless deployment each instance gets its own copy,
// so the "one upstream request per TTL window" guarantee holds per
// instance, not globally. A Redis-backed store would be a drop-in swap
// behind the same getOrFetch() signature.

type CacheEntry<T> = {
  value: T;
  fetchedAt: number;
};

const globalForMarketCache = globalThis as unknown as {
  __compassMarketCache?: Map<string, CacheEntry<unknown>>;
  __compassMarketInFlight?: Map<string, Promise<unknown>>;
};

const store: Map<string, CacheEntry<unknown>> =
  globalForMarketCache.__compassMarketCache ?? new Map();
globalForMarketCache.__compassMarketCache = store;

const inFlight: Map<string, Promise<unknown>> =
  globalForMarketCache.__compassMarketInFlight ?? new Map();
globalForMarketCache.__compassMarketInFlight = inFlight;

/**
 * Returns the cached value for `key` if it's younger than `ttlMs`.
 * Otherwise calls `fetchFn` exactly once — even if getOrFetch() is invoked
 * concurrently for the same key by multiple in-flight requests, which
 * share the same promise instead of each triggering their own upstream
 * request — caches the result, and returns it.
 *
 * Does NOT cache rejections: a failed fetchFn call is not stored, so the
 * next call (even immediately after) tries again rather than pinning a
 * transient failure for the full TTL window.
 */
export async function getOrFetch<T>(
  key: string,
  ttlMs: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = store.get(key) as CacheEntry<T> | undefined;
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.value;
  }

  const existingInFlight = inFlight.get(key) as Promise<T> | undefined;
  if (existingInFlight) {
    return existingInFlight;
  }

  const promise = (async () => {
    try {
      const value = await fetchFn();
      store.set(key, { value, fetchedAt: Date.now() });
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** Test/dev helper — clears every cached entry and in-flight promise. */
export function clearMarketCache(): void {
  store.clear();
  inFlight.clear();
}
