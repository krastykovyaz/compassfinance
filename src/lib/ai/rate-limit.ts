// Minimal, in-memory request guard for the AI endpoints (Part 23:
// "reasonable request limits/guards if practical"). Same honest scope as
// news-cache.ts's in-memory cache: correct within one long-lived Node
// process, not a global guarantee across multiple serverless instances.
// That's an acceptable trade-off for "practical" here — a real
// multi-instance deployment would swap this for a shared store (Redis
// INCR + EXPIRE), same as the news cache's documented upgrade path.

const WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 12; // generous for a single learner clicking around a lesson

// Hard ceiling on tracked keys. Some keys are derived from the caller's IP
// on an endpoint that needs no sign-in, so the number of distinct keys is
// ultimately up to whoever is sending requests — without a ceiling (and the
// sweep below) this Map only ever grew, one entry per key, for the life of
// the process.
export const RATE_LIMIT_MAX_BUCKETS = 10_000;

type Bucket = { count: number; windowStart: number };

const globalForRateLimit = globalThis as unknown as {
  __compassAIRateLimit?: Map<string, Bucket>;
  __compassAIRateLimitLastSweep?: number;
};

const buckets: Map<string, Bucket> =
  globalForRateLimit.__compassAIRateLimit ?? new Map<string, Bucket>();
globalForRateLimit.__compassAIRateLimit = buckets;

/** Drops every bucket whose window has already ended. Runs at most once per
 * window, so its cost is amortised across requests rather than paid on each. */
function sweepExpired(now: number): void {
  const lastSweep = globalForRateLimit.__compassAIRateLimitLastSweep ?? 0;
  if (now - lastSweep < WINDOW_MS) return;
  globalForRateLimit.__compassAIRateLimitLastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key);
  }
}

/** Returns true if the request should be allowed, false if the caller has
 * exceeded the per-minute cap for `key`. `options.max` overrides the default
 * cap for endpoints whose normal use is legitimately chattier (a polled
 * read) — the default is sized for a person clicking, not for polling. */
export function checkRateLimit(key: string, options?: { max?: number }): boolean {
  const now = Date.now();
  const max = options?.max ?? DEFAULT_MAX_REQUESTS_PER_WINDOW;
  sweepExpired(now);

  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    // Re-inserted (not updated in place) so Map order stays "oldest window
    // first", which is what the ceiling below evicts by.
    buckets.delete(key);
    if (buckets.size >= RATE_LIMIT_MAX_BUCKETS) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= max) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/** Caller identifier taken from what the reverse proxy itself reports,
 * never from what the client claims.
 *
 * nginx sets X-Real-IP to the connecting address (overwriting anything the
 * client sent) and APPENDS that same address to X-Forwarded-For, so the
 * client fully controls every X-Forwarded-For element except the last one.
 * Keying on the first element — as this used to — let any caller pick a
 * fresh bucket per request just by sending a different header value.
 *
 * This is only as trustworthy as the deployment: the app must be reachable
 * solely through the proxy (see deploy/compass.service, which binds the
 * server to 127.0.0.1 for exactly this reason). Falls back to a constant
 * when nothing is present (e.g. local dev) — the limiter still works, it
 * just shares one bucket across all local requests. */
export function getClientKey(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return "local";
}
