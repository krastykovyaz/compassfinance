"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Radio, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AssetRow } from "./asset-row";
import { ALL_ASSETS } from "@/lib/assets/catalog";
import { filterAssets, OVERVIEW_FILTERS, OverviewFilter } from "@/lib/assets/filters";
import { isAssetLocked } from "@/lib/assets/lock-status";
import { ALL_MARKET_SYMBOLS } from "@/lib/market/market-types";
import { useMarketData } from "@/lib/market/market-provider";
import { useFavorites } from "@/lib/favorites/favorites-provider";
import { usePaperAccount } from "@/lib/trading/paper-account-provider";
import { useProgress } from "@/lib/progress-store";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";

function useFilterLabels(t: (key: string) => string): Record<OverviewFilter, string> {
  return {
    all: t("home.filterAll"),
    favorites: t("home.filterFavorites"),
    portfolio: t("home.filterOwned"),
    index: t("home.tabIndices"),
    stock: t("home.tabStocks"),
    commodity: t("home.tabCommodities"),
    crypto: t("home.tabCrypto"),
  };
}

// Overview only ever previews a handful of rows per filter — the full,
// unrestricted list (still filterable the same way) lives at /markets.
// Capping the height here (rather than slicing the array to 3 items) lets
// someone scroll through everything in the current filter right from the
// home screen without leaving it; "See all" is for jumping to the full
// page, not for reaching rows that scrolling already shows.
const VISIBLE_ROWS_MAX_HEIGHT = "max-h-[204px]"; // ~3 rows

export function MarketOverview() {
  const [filter, setFilter] = useState<OverviewFilter>("all");
  const { bySlug, unavailable, isLoading } = useMarketData(ALL_MARKET_SYMBOLS);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { account } = usePaperAccount();
  const { isInvestmentUnlocked } = useProgress();
  const { t } = useTranslation();
  const FILTER_LABEL = useFilterLabels(t);
  const EMPTY_STATE: Partial<Record<OverviewFilter, string>> = {
    favorites: t("market.favoritesEmptyState"),
    portfolio: t("market.ownedEmptyState"),
  };

  // "Owned" = the user's real paper-trading account currently holds a
  // quantity > 0 of this asset — the same account Home/Portfolio/Position
  // read from, not a separate mock list.
  const isInPortfolio = useMemo(
    () => (assetId: string) => (account?.positions.some((p) => p.assetId === assetId) ?? false),
    [account]
  );

  const data = useMemo(
    () => filterAssets(ALL_ASSETS, filter, { isFavorite, isInPortfolio }),
    [filter, isFavorite, isInPortfolio]
  );

  const anyUnavailable = data.some((a) => !bySlug[a.id]);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">{t("home.marketOverview")}</h2>
        <span
          className={`flex items-center gap-1 text-[11px] font-medium ${
            anyUnavailable ? "text-ink-faint" : "text-positive"
          }`}
        >
          {anyUnavailable ? (
            <span key="unavailable" className="contents">
              <TriangleAlert size={11} />
              {t("home.marketDataUnavailable")}
            </span>
          ) : (
            <span key="live" className="contents">
              <Radio size={11} className={isLoading ? "animate-pulse" : ""} />
              {t("home.live")}
            </span>
          )}
        </span>
      </div>

      <div className="no-scrollbar -mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
        {OVERVIEW_FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-ink text-surface"
                  : "bg-surface-2 text-ink-muted hover:text-ink"
              )}
            >
              {FILTER_LABEL[f]}
            </button>
          );
        })}
      </div>

      {data.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-muted">
          {EMPTY_STATE[filter] ?? t("market.noAssetsMatchFilter")}
        </p>
      ) : (
        <div className={cn("mt-2 divide-y divide-border overflow-y-auto", VISIBLE_ROWS_MAX_HEIGHT)}>
          {data.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              quote={bySlug[asset.id]}
              unavailableReason={unavailable[asset.id]}
              isFavorite={isFavorite(asset.id)}
              onToggleFavorite={() => toggleFavorite(asset.id)}
              inPortfolio={isInPortfolio(asset.id)}
              locked={isAssetLocked(asset.id, isInvestmentUnlocked)}
            />
          ))}
        </div>
      )}

      <Link
        href={`/markets?filter=${filter}`}
        className="mt-2 flex items-center justify-center gap-1 rounded-xl py-2 text-[13px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
      >
        See all
        <ChevronRight size={14} />
      </Link>
    </Card>
  );
}
