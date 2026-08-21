// Lightweight server-side cache for the AI Learning Engine, same pattern
// as src/lib/news/news-cache.ts: an in-memory Map, reused across hot
// reloads via globalThis, good enough for local dev / single-instance
// deployments. Explicitly NOT Redis or a database — Part 17 says not to
// introduce one just for this milestone.
//
// What's cacheable: explanation and question generation are deterministic
// enough per (operation, assetId, lessonId, difficulty, locale[, concept])
// that repeating the identical request shortly after is very likely the
// same learner re-opening the same lesson, not a request for fresh
// variation — caching avoids paying for the same call twice. Assessment
// is NOT cached: it depends on the learner's own free-text answer, which
// is different every time by construction, so there's nothing to reuse.

type CacheEntry = { text: string; expiresAt: number };

const TTL_MS = 15 * 60 * 1000; // 15 minutes

const globalForAICache = globalThis as unknown as {
  __compassAICache?: Map<string, CacheEntry>;
};

const store: Map<string, CacheEntry> =
  globalForAICache.__compassAICache ?? new Map<string, CacheEntry>();
globalForAICache.__compassAICache = store;

export function buildCacheKey(parts: (string | undefined)[]): string {
  return parts.map((p) => p ?? "").join("::");
}

export function getCached(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.text;
}

export function setCached(key: string, text: string): void {
  store.set(key, { text, expiresAt: Date.now() + TTL_MS });
}
