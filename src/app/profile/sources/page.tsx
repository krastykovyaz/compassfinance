"use client";

import { Newspaper } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { useNews } from "@/lib/news/use-news";
import { getDistinctSourceNames } from "@/lib/news/count-distinct-sources";
import { useTranslation } from "@/lib/i18n/locale-provider";

// Real, current publisher names — the exact same set the Profile page's
// count comes from (getDistinctSourceNames), so this list and that
// number can never drift apart. There's no separate curated/toggleable
// source registry in this app (see news-provider.ts) — this reflects
// whichever real publishers the configured news provider is currently
// returning, nothing invented and nothing manageable yet.
export default function TrustedSourcesPage() {
  const { t } = useTranslation();
  const { items, isLoading, error } = useNews();
  const sources = getDistinctSourceNames(items);

  return (
    <AppShell>
      <Header title={t("linkRows.trustedSources")} backHref="/profile" />
      <div className="space-y-3 px-5">
        {isLoading ? (
          <Card>
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
          </Card>
        ) : error ? (
          <Card>
            <p className="text-[13px] text-negative">{error}</p>
          </Card>
        ) : sources.length === 0 ? (
          <Card>
            <p className="text-[13px] text-ink-muted">{t("trustedSources.empty")}</p>
          </Card>
        ) : (
          <>
            <p className="text-[13px] text-ink-muted">{t("trustedSources.subtitle")}</p>
            <Card className="divide-y divide-border p-0 px-4">
              {sources.map((source) => (
                <div key={source} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                    <Newspaper size={15} />
                  </div>
                  <span className="text-[14px] font-medium text-ink">{source}</span>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
