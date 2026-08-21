// Marketaux news provider — SERVER-ONLY.
//
// This file must never be imported from a client component or anything
// bundled into browser JS. It reads MARKETAUX_API_TOKEN (no NEXT_PUBLIC_
// prefix, so Next.js never inlines it into client bundles) and is only
// ever invoked from src/app/api/news/route.ts, which runs on the server.
//
// Design constraint: exactly one upstream request per call. Category
// filtering (stocks/indices/crypto/earnings) happens afterwards, in
// news-types.ts, against the single batch this returns — never by issuing
// a second Marketaux request.

import { ALL_COMPASS_SYMBOLS, NewsCategory, NewsItem, NewsProvider } from "./news-types";

const MARKETAUX_BASE_URL = "https://api.marketaux.com/v1/news/all";
const ARTICLE_LIMIT = 3;

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

export const marketauxProvider: NewsProvider = {
  id: "marketaux",
  async getLatestNews(): Promise<NewsItem[]> {
    const token = process.env.MARKETAUX_API_TOKEN;
    if (!token) {
      throw new Error("MARKETAUX_API_TOKEN is not configured");
    }

    // ONE request. Biased toward Compass's tracked asset universe (indices,
    // the four tracked stocks, BTC/ETH) so a single call returns a broad,
    // relevant mix across every category the News screen filters by —
    // never a second request per symbol or category.
    const params = new URLSearchParams({
      api_token: token,
      language: "en",
      limit: String(ARTICLE_LIMIT),
      filter_entities: "true",
      must_have_entities: "true",
      symbols: ALL_COMPASS_SYMBOLS.join(","),
    });

    let res: Response;
    try {
      res = await fetch(`${MARKETAUX_BASE_URL}?${params.toString()}`, {
        // This route is only ever called from getOrFetchNews on a 20-minute
        // cache cadence, so no need for Next's own fetch cache on top.
        cache: "no-store",
        // Hard timeout. Without this, a slow/hanging upstream response can
        // leave the request pending indefinitely — which, combined with
        // getOrFetchNews's in-flight dedupe, would make every concurrent
        // News screen hang on its loading skeleton forever instead of
        // failing over to cached/mock data.
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      // Network failure, DNS failure, or the 15s timeout above firing.
      // Logged server-side only — never sent to the client.
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[marketaux-provider] network error reaching Marketaux: ${reason}`);
      throw new Error("Marketaux request failed (network error)");
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      // Logged server-side only — never sent to the client. This is the
      // one place to look when NEWS_PROVIDER=marketaux isn't returning
      // real articles locally.
      console.error(
        `[marketaux-provider] request failed: ${res.status} ${res.statusText} — ${bodyText.slice(0, 500)}`
      );
      throw new Error(`Marketaux request failed (${res.status})`);
    }

    const json = (await res.json()) as MarketauxResponse;
    if (json.error) {
      console.error(
        `[marketaux-provider] API error: ${json.error.code ?? "unknown"} — ${json.error.message ?? ""}`
      );
      throw new Error(`Marketaux error: ${json.error.message ?? json.error.code}`);
    }

    return (json.data ?? []).map(normalize);
  },
};
