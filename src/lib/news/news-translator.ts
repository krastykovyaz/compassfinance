// Server-only batch translation for News previews.
// Never import this module from client components.
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek-provider";
import type { AIProvider } from "@/lib/ai/provider";
import { NewsItem } from "./news-types";
import {
  buildNewsTranslationCacheKey,
  clearNewsTranslationInFlight,
  getCachedNewsTranslation,
  getNewsTranslationInFlight,
  setCachedNewsTranslation,
  setNewsTranslationInFlight,
} from "./news-translation-cache";

export type NewsLocale = "en" | "fr" | "ru";

type TranslationRow = {
  id: string;
  title: string;
  description: string;
};

function parseTranslationRows(raw: string, source: NewsItem[]): TranslationRow[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (!fenced) return null;
    try {
      parsed = JSON.parse(fenced);
    } catch {
      return null;
    }
  }

  const rows =
    parsed && typeof parsed === "object" && "items" in parsed
      ? (parsed as { items?: unknown }).items
      : parsed;

  if (!Array.isArray(rows) || rows.length !== source.length) return null;

  const sourceIds = new Set(source.map((item) => item.id));
  const seen = new Set<string>();

  const result: TranslationRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") return null;
    const obj = row as Record<string, unknown>;
    if (
      typeof obj.id !== "string" ||
      !sourceIds.has(obj.id) ||
      seen.has(obj.id) ||
      typeof obj.title !== "string" ||
      typeof obj.description !== "string" ||
      obj.title.trim().length === 0 ||
      obj.title.length > 500 ||
      obj.description.length > 5000
    ) {
      return null;
    }
    seen.add(obj.id);
    result.push({
      id: obj.id,
      title: obj.title,
      description: obj.description,
    });
  }

  if (seen.size !== source.length) return null;
  return result;
}

function applyTranslations(source: NewsItem[], rows: TranslationRow[]): NewsItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return source.map((item) => {
    const translated = byId.get(item.id);
    return translated
      ? { ...item, title: translated.title, description: translated.description }
      : item;
  });
}

function buildPrompt(items: NewsItem[], locale: NewsLocale) {
  const language = locale === "fr" ? "French" : "Russian";
  const payload = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
  }));

  return {
    system: [
      "You are Compass News Translator.",
      `Translate the supplied financial news previews into ${language}.`,
      "Translate ONLY the title and description. Never change IDs.",
      "Preserve financial meaning, numbers, tickers, company names, index names, URLs, and proper nouns.",
      "Do not add facts, analysis, opinions, summaries, or recommendations.",
      "Keep the translation concise and natural for a financial-news app.",
      "If a description is empty, keep it empty.",
      'Return ONLY valid JSON in this exact shape: {"items":[{"id":"...","title":"...","description":"..."}]}',
      "Return exactly one item for every input item, in the same order.",
    ].join("\n"),
    user: JSON.stringify({ items: payload }),
  };
}

async function translateBatch(
  items: NewsItem[],
  locale: NewsLocale,
  provider: AIProvider = new DeepSeekProvider()
): Promise<NewsItem[]> {
  if (locale === "en" || items.length === 0) return items;

  const { system, user } = buildPrompt(items, locale);
  const result = await provider.complete({
    systemPrompt: system,
    userPrompt: user,
    expectJson: true,
    temperature: 0.1,
    maxTokens: Math.max(1200, items.length * 700),
  });

  if (!result.ok) {
    console.error(`[news-translator] ${locale} translation failed: ${result.kind}`);
    return items;
  }

  const rows = parseTranslationRows(result.text, items);
  if (!rows) {
    console.error(`[news-translator] ${locale} returned invalid batch JSON`);
    return items;
  }

  return applyTranslations(items, rows);
}

/**
 * Translate the complete news batch once per locale/batch. Both the feed
 * and detail page use this same server cache, so opening an article never
 * causes another LLM request for its description.
 */
export async function getLocalizedNews(
  items: NewsItem[],
  locale: NewsLocale
): Promise<{ items: NewsItem[]; translated: boolean; cached: boolean }> {
  if (locale === "en" || items.length === 0) {
    return { items, translated: false, cached: false };
  }

  const key = buildNewsTranslationCacheKey(locale, items);
  const cached = getCachedNewsTranslation(key);
  if (cached) return { items: cached, translated: true, cached: true };

  const existing = getNewsTranslationInFlight(key);
  if (existing) {
    const translated = await existing;
    return { items: translated, translated: true, cached: true };
  }

  const promise = translateBatch(items, locale);
  setNewsTranslationInFlight(key, promise);

  try {
    const translated = await promise;
    setCachedNewsTranslation(key, translated);
    return { items: translated, translated: true, cached: false };
  } finally {
    clearNewsTranslationInFlight(key);
  }
}
