"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { FilterChips } from "@/components/ui/filter-chips";
import { NewsCard } from "@/components/news/news-card";
import { NewsSkeleton } from "@/components/news/news-skeleton";
import { useNews } from "@/lib/news/use-news";
import { filterNewsByCategory } from "@/lib/news/news-types";
import { NewsFilter } from "@/lib/mock-data";
import { useProgress } from "@/lib/progress-store";
import { sortNewsByInterest } from "@/lib/interests/interests";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function NewsPage() {
  const [filter, setFilter] = useState<NewsFilter>("all");
  const { items, isLoading, error, degraded, refresh } = useNews();
  const { state } = useProgress();
  const { t } = useTranslation();

  const newsFilters: { id: NewsFilter; label: string }[] = [
    { id: "all", label: t("news.filterAll") },
    { id: "following", label: t("news.filterFollowing") },
    { id: "stocks", label: t("news.filterStocks") },
    { id: "indices", label: t("news.filterIndices") },
    { id: "earnings", label: t("news.filterEarnings") },
  ];

  const filtered = useMemo(() => filterNewsByCategory(items, filter), [items, filter]);
  // Personalization only — nothing is removed here, items already passed
  // the category filter above. See interests.ts's sortNewsByInterest()
  // header comment for why this is a stable re-rank, not a hide-list.
  const prioritized = useMemo(
    () => sortNewsByInterest(filtered, state.interests),
    [filtered, state.interests]
  );

  return (
    <AppShell>
      <Header title={t("news.news")} />

      <div className="space-y-4 px-5">
        <p className="text-[13px] font-medium text-ink-muted">{t("news.forYourPortfolio")}</p>

        <FilterChips options={newsFilters} value={filter} onChange={setFilter} />

        {degraded && !error ? (
          <p className="text-xs text-ink-faint">{t("news.showingRecent")}</p>
        ) : null}

        {isLoading ? (
          <NewsSkeleton />
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-[14px] text-ink-muted">{t("news.unavailable")}</p>
            <button
              onClick={refresh}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-blue"
            >
              <RefreshCw size={14} /> {t("news.tryAgain")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {prioritized.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
            {prioritized.length === 0 ? (
              <p className="py-10 text-center text-[14px] text-ink-muted">
                {t("news.noNews")}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}
