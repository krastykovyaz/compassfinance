"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { AssetRow } from "@/components/home/asset-row";
import { HyperliquidMarketRow } from "@/components/markets/hyperliquid-market-row";
import { useHyperliquidMarkets } from "@/lib/hyperliquid/hyperliquid-provider";
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

function isOverviewFilter(value: string | null): value is OverviewFilter {
  return !!value && (OVERVIEW_FILTERS as string[]).includes(value);
}

function MarketsPageContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter");
  const [filter, setFilter] = useState<OverviewFilter>(
    isOverviewFilter(initialFilter) ? initialFilter : "all"
  );
  const { t } = useTranslation();
  const FILTER_LABEL = useFilterLabels(t);
  const EMPTY_STATE: Partial<Record<OverviewFilter, string>> = {
    favorites: t("market.favoritesEmptyState"),
    portfolio: t("market.ownedEmptyState"),
  };

  const { bySlug, unavailable } = useMarketData(ALL_MARKET_SYMBOLS);
  const { markets: hyperliquidMarkets, enabled: hyperliquidEnabled } = useHyperliquidMarkets();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { account } = usePaperAccount();
  const { isInvestmentUnlocked } = useProgress();

  const isInPortfolio = useMemo(
    () => (assetId: string) => (account?.positions.some((p) => p.assetId === assetId) ?? false),
    [account]
  );

  const data = useMemo(
    () => filterAssets(ALL_ASSETS, filter, { isFavorite, isInPortfolio }),
    [filter, isFavorite, isInPortfolio]
  );

  // Requirement: perpetuals sorted into their corresponding Markets tab
  // rather than always dumping the full Hyperliquid list regardless of
  // which tab is active. `m.assetId` is Hyperliquid's OWN raw coin symbol
  // (e.g. "BTC", "xyz:AAPL") — never a catalog id — so matching must go
  // through `m.compassAssetId` (the real catalog id, e.g. "btc"/"aapl")
  // instead. That's exactly the same All/Favorites/Portfolio/category
  // filter already applied to `data`, reused rather than reimplemented.
  // Still a fully separate list/section from the catalog rows above
  // (never interleaved into one list) — real perpetual markets and
  // catalog/paper-trading assets stay visually distinct, same principle
  // as the Portfolio page's Paper/Real separation.
  const visiblePerpetuals = useMemo(
    () => hyperliquidMarkets.filter((m) => data.some((a) => a.id === m.compassAssetId)),
    [hyperliquidMarkets, data]
  );

  return (
    <AppShell>
      <Header title={t("market.markets")} backHref="/" />

      <div className="px-5">
        <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
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
          <p className="py-10 text-center text-[13px] text-ink-muted">
            {EMPTY_STATE[filter] ?? t("market.noAssetsMatchFilter")}
          </p>
        ) : (
          <div className="mt-2 divide-y divide-border">
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

        {/* Independent from the catalog list above — Hyperliquid perpetual
            markets are real, live data but have no learning content, no
            investment-unlock stage, and are not tradable via Paper Trading.
            Renders nothing at all when the feature is off or unreachable,
            so the rest of this page is unaffected either way. */}
        {hyperliquidEnabled && visiblePerpetuals.length > 0 ? (
          <div className="mt-6">
            <h2 className="px-1 text-[15px] font-semibold text-ink">
              {t("market.perpetualsHyperliquid")}
            </h2>
            <div className="mt-1 divide-y divide-border">
              {visiblePerpetuals.map((m) => (
                <HyperliquidMarketRow key={m.assetId} market={m} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function MarketsPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <AppShell>
          <Header title={t("market.markets")} backHref="/" />
        </AppShell>
      }
    >
      <MarketsPageContent />
    </Suspense>
  );
}
