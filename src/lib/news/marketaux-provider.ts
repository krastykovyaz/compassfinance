// Marketaux news provider — SERVER-ONLY.
//
// This file must never be imported from a client component or anything
// bundled into browser JS. It reads MARKETAUX_API_TOKEN (no NEXT_PUBLIC_
// prefix, so Next.js never inlines it into client bundles) and is only
// ever invoked from src/app/api/news/route.ts, which runs on the server.
//
// Design constraint: our Marketaux plan hard-caps every single request at
// 3 articles, regardless of the `limit` param sent (confirmed live — a
// higher limit just comes back with a `warnings: ["limit is higher than
// your plan allows"]` and still returns 3). To show a real week's worth of
// news with room to "load more" instead of just 3 headlines, this fetches
// several PAGES (Marketaux's own `page` param) sequentially, filtered to
// the last 7 days and sorted newest-first, and combines them into one
// batch. Category filtering (stocks/indices/crypto/earnings) still happens
// afterwards, in news-types.ts, against that combined batch — never by
// issuing a per-category request. See news-cache.ts's TTL for why this
// multi-request batch is cached for hours, not minutes: the account's
// daily request quota is small enough that polling every 20 minutes with
// even a handful of requests per refresh would exhaust it.

import { ALL_COMPASS_SYMBOLS, NewsCategory, NewsItem, NewsProvider } from "./news-types";

const MARKETAUX_BASE_URL = "https://api.marketaux.com/v1/news/all";
// The real per-request cap on our plan — raising this does nothing (see
// comment above), it's just what we ask for on each individual page.
const ARTICLE_LIMIT = 3;
// How many pages (of ARTICLE_LIMIT each) to combine into one batch — the
// "one week of news" the News screen shows, revealed a page at a time via
// "Load more". Kept modest to stay well within the daily request quota
// once multiplied by the cache refresh cadence.
const PAGES_TO_FETCH = 4;
const LOOKBACK_DAYS = 7;

type MarketauxEntity = {
  symbol?: string;
  name?: string;
  type?: string; // "equity" | "index" | "cryptocurrency" | "etf" | ...
  industry?: string;
};

type MarketauxArticle = {
  uuid: string;
  title: string;
  description?: string;
  snippet?: string;
  url: string;
  image_url?: string | null;
  source?: string;
  published_at: string;
  entities?: MarketauxEntity[];
};

type MarketauxResponse = {
  meta?: { found: number; returned: number; limit: number; page: number };
  data?: MarketauxArticle[];
  error?: { code?: string; message?: string };
};

const EARNINGS_KEYWORDS = [
  "earnings",
  "quarterly",
  "q1",
  "q2",
  "q3",
  "q4",
  "eps",
  "revenue",
  "guidance",
  "results",
];

function classify(article: MarketauxArticle): NewsCategory {
  const entities = article.entities ?? [];
  const types = new Set(entities.map((e) => (e.type ?? "").toLowerCase()));

  if (types.has("cryptocurrency")) return "crypto";
  if (types.has("index")) return "indices";

  const haystack = `${article.title} ${article.description ?? ""}`.toLowerCase();
  const looksLikeEarnings = EARNINGS_KEYWORDS.some((kw) => haystack.includes(kw));
  if (looksLikeEarnings && (types.has("equity") || types.has("etf"))) return "earnings";

  if (types.has("equity") || types.has("etf")) return "stocks";

  return "general";
}

function normalize(article: MarketauxArticle): NewsItem {
  const entities = article.entities ?? [];
  return {
    id: article.uuid,
    title: article.title,
    description: article.description || article.snippet || "",
    source: article.source || "Unknown source",
    url: article.url,
    imageUrl: article.image_url || null,
    publishedAt: article.published_at,
    symbols: Array.from(
      new Set(entities.map((e) => e.symbol).filter((s): s is string => Boolean(s)))
    ),
    entities: Array.from(
      new Set(entities.map((e) => e.name).filter((n): n is string => Boolean(n)))
    ),
    category: classify(article),
  };
}

function lookbackStartParam(): string {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  // Marketaux accepts a plain "YYYY-MM-DDTHH:MM:SS" — drop the
  // milliseconds/Z suffix toISOString() adds.
  return since.toISOString().replace(/\.\d{3}Z$/, "");
}

/** Fetches one page (ARTICLE_LIMIT articles) — throws on any failure, same
 * classification/logging as before this became multi-page. */
async function fetchPage(token: string, page: number): Promise<MarketauxArticle[]> {
  // Biased toward Compass's tracked asset universe (indices, the four
  // tracked stocks, BTC/ETH) so every page returns a broad, relevant mix
  // across every category the News screen filters by — never a separate
  // request per symbol or category, only per page.
  const params = new URLSearchParams({
    api_token: token,
    language: "en",
    limit: String(ARTICLE_LIMIT),
    filter_entities: "true",
    must_have_entities: "true",
    symbols: ALL_COMPASS_SYMBOLS.join(","),
    published_after: lookbackStartParam(),
    sort: "published_desc",
    page: String(page),
  });

  let res: Response;
  try {
    res = await fetch(`${MARKETAUX_BASE_URL}?${params.toString()}`, {
      // This provider is only ever called from getOrFetchNews on a
      // multi-hour cache cadence, so no need for Next's own fetch cache.
      cache: "no-store",
      // Hard timeout per page. Without this, a slow/hanging upstream
      // response can leave the request pending indefinitely — which,
      // combined with getOrFetchNews's in-flight dedupe, would make every
      // concurrent News screen hang on its loading skeleton forever
      // instead of failing over to cached/mock data.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[marketaux-provider] network error reaching Marketaux (page ${page}): ${reason}`);
    throw new Error("Marketaux request failed (network error)");
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error(
      `[marketaux-provider] request failed (page ${page}): ${res.status} ${res.statusText} — ${bodyText.slice(0, 500)}`
    );
    throw new Error(`Marketaux request failed (${res.status})`);
  }

  const json = (await res.json()) as MarketauxResponse;
  if (json.error) {
    console.error(
      `[marketaux-provider] API error (page ${page}): ${json.error.code ?? "unknown"} — ${json.error.message ?? ""}`
    );
    throw new Error(`Marketaux error: ${json.error.message ?? json.error.code}`);
  }

  return json.data ?? [];
}

export const marketauxProvider: NewsProvider = {
  id: "marketaux",
  async getLatestNews(): Promise<NewsItem[]> {
    const token = process.env.MARKETAUX_API_TOKEN;
    if (!token) {
      throw new Error("MARKETAUX_API_TOKEN is not configured");
    }

    // Page 1 failing is a real "the feed is down" failure — propagate it
    // so getOrFetchNews falls back to stale cache / the route falls back
    // to mock, same as before this became multi-page. A LATER page
    // failing (rarer — only hit after several already-successful
    // requests) degrades gracefully instead: keep what we already fetched
    // rather than discarding real articles over one flaky page.
    const raw: MarketauxArticle[] = await fetchPage(token, 1);
    for (let page = 2; page <= PAGES_TO_FETCH; page++) {
      try {
        raw.push(...(await fetchPage(token, page)));
      } catch (err) {
        console.error(`[marketaux-provider] stopping early at page ${page}:`, err);
        break;
      }
    }

    // Defensive de-dupe (Marketaux pagination is offset-based, so overlap
    // is not expected, but a duplicate uuid must never render as two
    // cards) and an explicit newest-first sort — trusting sort=published_desc
    // to hold across independently-fetched pages isn't worth the risk when
    // a single Array.sort() makes it a certainty.
    const seen = new Set<string>();
    const deduped = raw.filter((a) => (seen.has(a.uuid) ? false : (seen.add(a.uuid), true)));
    deduped.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));

    return deduped.map(normalize);
  },
};
