// Minimal, in-memory request guard for the AI endpoints (Part 23:
// "reasonable request limits/guards if practical"). Same honest scope as
// news-cache.ts's in-memory cache: correct within one long-lived Node
// process, not a global guarantee across multiple serverless instances.
// That's an acceptable trade-off for "practical" here — a real
// multi-instance deployment would swap this for a shared store (Redis
// INCR + EXPIRE), same as the news cache's documented upgrade path.

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 12; // generous for a single learner clicking around a lesson

type Bucket = { count: number; windowStart: number };

const globalForRateLimit = globalThis as unknown as {
  __compassAIRateLimit?: Map<string, Bucket>;
};

const buckets: Map<string, Bucket> =
  globalForRateLimit.__compassAIRateLimit ?? new Map<string, Bucket>();
globalForRateLimit.__compassAIRateLimit = buckets;

/** Returns true if the request should be allowed, false if the caller has
 * exceeded the per-minute cap. `key` is typically the caller's IP. */
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/** Best-effort caller identifier from standard proxy headers. Falls back
 * to a constant when nothing is present (e.g. local dev) — the limiter
 * still works, just shares one bucket across all local requests. */
export function getClientKey(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  return "local";
}
