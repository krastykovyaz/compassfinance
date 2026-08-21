// GET /api/news
//
// The only thing client code ever calls to get news. This is the boundary
// that keeps MARKETAUX_API_TOKEN server-side: this route runs on the
// server, reads it via news-provider.ts, and only ever returns normalized
// NewsItem[] — never a raw Marketaux response, never the token.

import { NextResponse } from "next/server";
import { getNewsProvider } from "@/lib/news/news-provider";
import { mockNewsProvider } from "@/lib/news/mock-news-provider";
import { getOrFetchNews } from "@/lib/news/news-cache";
import { getLocalizedNews, NewsLocale } from "@/lib/news/news-translator";

export async function GET(request: Request) {
  const localeParam = new URL(request.url).searchParams.get("locale");
  const locale: NewsLocale =
    localeParam === "fr" || localeParam === "ru" ? localeParam : "en";
  const provider = getNewsProvider();
  console.log(
    `[api/news] provider=${provider.id} tokenConfigured=${Boolean(
      process.env.MARKETAUX_API_TOKEN
    )} NEWS_PROVIDER=${process.env.NEWS_PROVIDER ?? "(unset)"}`
  );

  try {
    const { items, fromCache, fetchedAt, servedStaleAfterError } = await getOrFetchNews(
      () => provider.getLatestNews()
    );

    const localized = await getLocalizedNews(items, locale);

    return NextResponse.json({
      items: localized.items,
      source: provider.id,
      cached: fromCache || localized.cached,
      fetchedAt,
      locale,
      translated: localized.translated,
      // Set only when a refresh attempt failed and we recovered by serving
      // stale cached data — lets the UI show a subtle "Showing recent
      // news" note instead of a hard error.
      degraded: servedStaleAfterError,
    });
  } catch (err) {
    console.error("[api/news] provider fetch failed:", err);

    // A configured real provider must never be replaced with fabricated
    // articles. getOrFetchNews() has already attempted to serve stale real
    // data when possible; if none exists, report the real news feed as
    // temporarily unavailable instead of silently showing mock headlines.
    if (provider.id === "marketaux") {
      return NextResponse.json(
        {
          items: [],
          source: "marketaux",
          cached: false,
          fetchedAt: Date.now(),
          locale,
          translated: false,
          degraded: true,
          error: "News is temporarily unavailable",
        },
        { status: 503 }
      );
    }

    // Mock data remains available only when the application is explicitly
    // using the mock provider (for example CI/local setup without a token).
    try {
      const items = await mockNewsProvider.getLatestNews();
      const localized = await getLocalizedNews(items, locale);
      return NextResponse.json({
        items: localized.items,
        source: "mock",
        cached: localized.cached,
        fetchedAt: Date.now(),
        locale,
        translated: localized.translated,
        degraded: true,
      });
    } catch {
      return NextResponse.json(
        {
          items: [],
          source: "mock",
          cached: false,
          fetchedAt: Date.now(),
          locale,
          translated: false,
          degraded: true,
          error: "News is temporarily unavailable",
        },
        { status: 503 }
      );
    }
  }
}
