"use client";

import Link from "next/link";
import { TrendingUp, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useNews } from "@/lib/news/use-news";

// Milestone 25: "Today's insight" used to be a single hardcoded,
// never-changing translated string. It now shows the most recent real
// headline from the same news pipeline (useNews() -> /api/news ->
// Marketaux, with stale-real-data fallback only after a refresh
// failure) the News screen itself uses — not a second data source, and
// not fake copy.
export function InsightCard() {
  const { t } = useTranslation();
  const { items, isLoading, error } = useNews();
  const top = items[0];

  return (
    <Card>
      <p className="mb-2 text-[13px] font-medium text-ink-muted">{t("home.todaysInsight")}</p>
      {isLoading && items.length === 0 ? (
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <div className="mt-1 h-8 w-full animate-pulse rounded-lg bg-surface-2" />
        </div>
      ) : error && items.length === 0 ? (
        <div className="flex items-center gap-2 text-ink-faint">
          <TriangleAlert size={16} />
          <p className="text-[13px]">{t("home.insightUnavailable")}</p>
        </div>
      ) : top ? (
        <Link href={`/news/${top.id}`} className="flex items-start gap-3">
          <IconCircle colorKey="green">
            <TrendingUp size={18} />
          </IconCircle>
          <p className="pt-1 text-[14px] leading-snug text-ink">{top.title}</p>
        </Link>
      ) : (
        <p className="text-[13px] text-ink-faint">{t("home.insightUnavailable")}</p>
      )}
    </Card>
  );
}
