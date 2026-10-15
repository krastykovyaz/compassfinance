// Redirect targets must point at the site's PUBLIC address.
//
// Behind nginx, `request.url` does not carry it: Next does not trust the
// browser-supplied Host header when it builds a request's URL, so the origin
// comes from the server's own listening address and the browser is sent to
// something like https://localhost:3002/... (observed on the Interactive
// Brokers connect flow, with both `next start` and the standalone server).
//
// AUTH_URL is already required in production for Auth.js and holds the
// canonical public address, so redirects take their origin from it. Without
// it (local development) the request's own URL is correct and is used.
export function publicUrl(pathAndQuery: string, request: { url: string }): URL {
  const configured = process.env.AUTH_URL;
  if (configured) {
    try {
      return new URL(pathAndQuery, new URL(configured).origin);
    } catch {
      // A malformed AUTH_URL falls through to the request's own URL.
    }
  }
  return new URL(pathAndQuery, request.url);
}
