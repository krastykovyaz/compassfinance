"use client";

import Link from "next/link";
import { Star, TriangleAlert, Briefcase, Lock } from "lucide-react";
import { AssetCatalogEntry } from "@/lib/assets/catalog";
import { MarketAssetQuote } from "@/lib/market/market-types";
import { formatNumber, formatSignedPercent, cn } from "@/lib/utils";

export function AssetRow({
  asset,
  quote,
  unavailableReason,
  isFavorite,
  onToggleFavorite,
  inPortfolio,
  locked,
}: {
  asset: AssetCatalogEntry;
  quote?: MarketAssetQuote;
  unavailableReason?: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  inPortfolio: boolean;
  /** True when investing in this asset requires finishing a course first (see src/lib/learning/unlocks.ts). Undefined/false for assets with no investment gate at all. */
  locked?: boolean;
}) {
  const positive = (quote?.changePercent ?? 0) >= 0;

  return (
    <div className="flex items-center gap-1 rounded-xl px-1 py-2.5 transition-colors active:bg-surface-2">
      <button
        aria-label={isFavorite ? `Remove ${asset.name} from favorites` : `Add ${asset.name} to favorites`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2 hover:text-ink"
      >
        <Star size={16} fill={isFavorite ? "currentColor" : "none"} className={isFavorite ? "text-amber-500" : ""} />
      </button>

      <Link
        href={`/asset/${asset.slug}`}
        className="flex flex-1 items-center justify-between rounded-xl py-0.5"
      >
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[15px] font-medium text-ink">{asset.name}</p>
            {inPortfolio ? (
              <span
                title="In portfolio"
                className="flex items-center gap-0.5 rounded-full bg-blue/15 px-1.5 py-0.5 text-[10px] font-medium text-blue"
              >
                <Briefcase size={9} />
                In portfolio
              </span>
            ) : null}
            {locked ? (
              <span
                title="Complete the course to unlock investing"
                className="flex items-center gap-0.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint"
              >
                <Lock size={9} />
                Locked
              </span>
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">{asset.symbol}</p>
        </div>
        {quote ? (
          <div className="text-right">
            <p className="text-[15px] font-medium text-ink">{formatNumber(quote.price)}</p>
            <p
              className={cn(
                "text-xs font-medium",
                positive ? "text-positive" : "text-negative"
              )}
            >
              {formatSignedPercent(quote.changePercent)}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-ink-faint" title={unavailableReason}>
            <TriangleAlert size={13} />
            <span className="text-xs font-medium">Unavailable</span>
          </div>
        )}
      </Link>
    </div>
  );
}
