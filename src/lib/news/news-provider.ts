// Server-only entry point for the news layer. Picks a provider based on
// NEWS_PROVIDER, and is the single place that decides "real or mock" — the
// API route and everything downstream only ever calls getNewsProvider().

import { NewsProvider } from "./news-types";
import { mockNewsProvider } from "./mock-news-provider";
import { marketauxProvider } from "./marketaux-provider";

export function getNewsProvider(): NewsProvider {
  const requested = (process.env.NEWS_PROVIDER || "mock").toLowerCase();

  if (requested === "marketaux") {
    // Always return the real provider when it's explicitly requested —
    // even with no token configured. marketauxProvider.getLatestNews()
    // itself throws a clear "not configured" error in that case, which
    // the API route's existing failure chain (fresh cache -> stale cache
    // -> localized "unavailable") already handles correctly, because
    // provider.id stays "marketaux" and never falls into the route's
    // mock-fallback branch. Returning mockNewsProvider here instead used
    // to silently serve fake articles under a misconfigured production
    // NEWS_PROVIDER=marketaux, which is exactly what "never show mock
    // news as a fallback" rules out — mock is now reachable only via an
    // explicit NEWS_PROVIDER=mock (or leaving it unset).
    return marketauxProvider;
  }

  return mockNewsProvider;
}
