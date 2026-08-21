"use client";

// Client-side news hook. This is the ONLY thing the News screen imports for
// data — it calls our own /api/news route, which is server-cached. It never
// imports marketaux-provider.ts or reads MARKETAUX_API_TOKEN, since that
// code isn't safe to bundle into the client at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { NewsItem } from "./news-types";
import { useTranslation } from "@/lib/i18n/locale-provider";

// Polling our own cached route is cheap and doesn't touch Marketaux — the
// route's own 20-minute TTL is what actually gates upstream requests. This
// just lets an open tab pick up a cache refresh without a manual reload.
const CLIENT_POLL_MS = 5 * 60 * 1000;

type NewsApiResponse = {
  items: NewsItem[];
  source: "marketaux" | "mock";
  cached: boolean;
  fetchedAt: number;
  degraded: boolean;
  error?: string;
};

export type UseNewsResult = {
  items: NewsItem[];
  isLoading: boolean;
  /** Set only for a hard failure with no data at all to show. */
  error: string | null;
  /** True when showing stale real data after a refresh failure, or an explicitly configured mock provider. */
  degraded: boolean;
  source: "marketaux" | "mock";
  refresh: () => void;
};

export function useNews(): UseNewsResult {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [source, setSource] = useState<"marketaux" | "mock">("mock");
  const { locale } = useTranslation();
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsLoading(true);
    try {
      // Safety net: even though the server route has its own timeout on
      // the Marketaux call, this ensures the UI can never get stuck on
      // the loading skeleton indefinitely for any reason (slow localhost,
      // dev-server hiccup, etc).
      const res = await fetch(
        `/api/news?locale=${encodeURIComponent(locale)}`,
        { signal: AbortSignal.timeout(20_000) }
      );
      const json = (await res.json()) as NewsApiResponse;

      if (!res.ok && json.items.length === 0) {
        setError(json.error || "News is temporarily unavailable");
        setItems([]);
      } else {
        setItems(json.items);
        setError(null);
      }
      setDegraded(Boolean(json.degraded));
      setSource(json.source);
    } catch (err) {
      console.error("[useNews] failed to load news:", err);
      setError("News is temporarily unavailable");
    } finally {
      setIsLoading(false);
      hasLoadedOnce.current = true;
    }
  }, [locale]);

  useEffect(() => {
    const kickoff = setTimeout(load, 0);
    const interval = setInterval(load, CLIENT_POLL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [load]);

  return { items, isLoading, error, degraded, source, refresh: load };
}
