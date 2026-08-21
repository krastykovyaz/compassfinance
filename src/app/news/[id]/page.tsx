"use client";

import { use } from "react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { NewsSkeleton } from "@/components/news/news-skeleton";
import { useNews } from "@/lib/news/use-news";
import { findNewsById, SYMBOL_TO_SLUG, NewsItem } from "@/lib/news/news-types";
import { formatRelativeTime } from "@/lib/utils";
import { ColorKey } from "@/lib/mock-data";
import { useTranslation } from "@/lib/i18n/locale-provider";

const CATEGORY_COLOR: Record<NewsItem["category"], ColorKey> = {
  stocks: "slate",
  indices: "blue",
  crypto: "orange",
  earnings: "green",
  general: "purple",
};

// This reuses the same /api/news infrastructure as the News feed (via
// useNews()) rather than fetching or caching articles separately — there's
// no per-article API route. The article is looked up client-side from the
// already-cached batch.
//
// Milestone 9 follow-up: the full available body (Marketaux's
// description/excerpt — see news.externalDisclosure copy for why it's
// sometimes an excerpt rather than the complete article) is now the main
// focus of the page. "Read original article" is a small text link at the
// very end rather than a large button, since it's a secondary action —
// most of the reading happens inside Compass, not on the publisher's site.
export default function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { items, isLoading, error } = useNews();
  const [imgFailed, setImgFailed] = useState(false);
  const { t } = useTranslation();

  const article = findNewsById(items, id);
  const showImage = Boolean(article?.imageUrl) && !imgFailed;

  return (
    <AppShell>
      <Header title={t("news.news")} backHref="/news" />

      <div className="space-y-4 px-5">
        {isLoading ? (
          <NewsSkeleton />
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-[14px] text-ink-muted">{t("news.unavailable")}</p>
          </div>
        ) : !article ? (
          <div className="py-10 text-center">
            <p className="text-[14px] text-ink-muted">{t("news.articleUnavailable")}</p>
            <Link href="/news" className="mt-3 inline-block text-[13px] font-medium text-blue">
              {t("news.backToNews")}
            </Link>
          </div>
        ) : (
          <>
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-surface-2">
              {showImage ? (
                <Image
                  src={article.imageUrl!}
                  alt=""
                  fill
                  sizes="420px"
                  className="object-cover"
                  onError={() => setImgFailed(true)}
                  // Some publisher CDNs hotlink-protect on the Referer
                  // header — omitting it avoids images silently failing
                  // to load just because they're embedded here.
                  referrerPolicy="no-referrer"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink-faint">
                  <Newspaper size={36} />
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="font-medium text-ink">{article.source}</span>
              <span>·</span>
              <span>{formatRelativeTime(article.publishedAt)}</span>
            </div>

            <h1 className="text-[21px] font-semibold leading-snug text-ink">{article.title}</h1>

            {article.symbols.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {article.symbols.map((symbol) => {
                  const slug = SYMBOL_TO_SLUG[symbol.toUpperCase()];
                  const badge = (
                    <Badge colorKey={CATEGORY_COLOR[article.category]}>{symbol}</Badge>
                  );
                  return slug ? (
                    <Link key={symbol} href={`/asset/${slug}`}>
                      {badge}
                    </Link>
                  ) : (
                    <span key={symbol}>{badge}</span>
                  );
                })}
              </div>
            ) : null}

            {/* The full body of the article available from Marketaux —
                the main content of this screen, not a preview. */}
            {article.description ? (
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">
                {article.description}
              </p>
            ) : (
              <p className="text-[14px] leading-relaxed text-ink-muted">
                {t("news.noDescription")}
              </p>
            )}

            {/* Secondary action only — a small link, not a prominent
                button, since reading happens inside Compass. */}
            <div className="border-t border-border pt-4">
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-blue"
              >
                {t("news.readOriginal")}
                <ExternalLink size={13} />
              </a>
              <p className="mt-1 text-[11px] text-ink-faint">
                {article.source} {t("news.externalDisclosure")}
              </p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
