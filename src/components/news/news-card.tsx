"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Newspaper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewsItem, SYMBOL_TO_SLUG } from "@/lib/news/news-types";
import { formatRelativeTime } from "@/lib/utils";
import { ColorKey } from "@/lib/mock-data";

const CATEGORY_COLOR: Record<NewsItem["category"], ColorKey> = {
  stocks: "slate",
  indices: "blue",
  crypto: "orange",
  earnings: "green",
  general: "purple",
};

// Clicking the card opens the News Detail view. Clicking a ticker tag
// navigates straight to that asset's page instead, and must not also open
// News Detail — so the card is a clickable div (not an <a>), and each
// ticker tag is its own <Link> that stops the click from bubbling up.
export function NewsCard({ item }: { item: NewsItem }) {
  const router = useRouter();
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imgFailed;

  function openDetail() {
    router.push(`/news/${encodeURIComponent(item.id)}`);
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") openDetail();
      }}
      className="cursor-pointer transition-colors active:bg-surface-2"
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
        <span className="font-medium text-ink">{item.source}</span>
        <span>·</span>
        <span>{formatRelativeTime(item.publishedAt)}</span>
      </div>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-ink">{item.title}</p>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-muted">
              {item.description}
            </p>
          ) : null}
          {item.symbols.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.symbols.slice(0, 3).map((symbol) => {
                const slug = SYMBOL_TO_SLUG[symbol.toUpperCase()];
                const badge = (
                  <Badge colorKey={CATEGORY_COLOR[item.category]}>{symbol}</Badge>
                );
                // Only symbols that map to a known Compass asset are
                // clickable — everything else is a plain, informational tag.
                return slug ? (
                  <Link
                    key={symbol}
                    href={`/asset/${slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="underline-offset-2 hover:underline"
                    aria-label={`View ${symbol} asset page`}
                  >
                    {badge}
                  </Link>
                ) : (
                  <span key={symbol}>{badge}</span>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {showImage ? (
            <Image
              src={item.imageUrl!}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
              onError={() => setImgFailed(true)}
              referrerPolicy="no-referrer"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-faint">
              <Newspaper size={22} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
