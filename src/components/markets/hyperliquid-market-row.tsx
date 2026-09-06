"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useHyperliquidOrderBook } from "@/lib/hyperliquid/use-hyperliquid-order-book";
import type { HyperliquidMarketSnapshot } from "@/lib/hyperliquid/hyperliquid-types";
import { getAsset } from "@/lib/assets/catalog";
import { AssetDetailsPanel } from "@/components/hyperliquid/asset-details-panel";
import { formatCurrency, formatSignedPercent, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

// Deliberately NOT a variant of AssetRow: this row has no favorite star,
// no "in portfolio" badge, no lock badge — Hyperliquid perpetual markets
// are not part of the learning-content catalog, Paper Trading, or the
// investment-unlock system at all, and reusing AssetRow would risk
// someone later wiring one of those concepts in by habit.

function OrderBookLevels({ coin, expanded }: { coin: string; expanded: boolean }) {
  const { book, status } = useHyperliquidOrderBook(coin, { enabled: expanded, pollMs: 5_000 });

  if (!expanded) return null;
  if (status === "loading" || !book) {
    return <p className="px-1 py-3 text-center text-[12px] text-ink-faint">Loading order book…</p>;
  }
  if (status === "unavailable") {
    return <p className="px-1 py-3 text-center text-[12px] text-ink-faint">Order book unavailable</p>;
  }

  const bids = book.bids.slice(0, 5);
  const asks = book.asks.slice(0, 5);

  return (
    <div className="grid grid-cols-2 gap-3 px-1 py-2 text-[12px]">
      <div>
        <p className="mb-1 font-medium text-positive">Bids</p>
        {bids.map((l, i) => (
          <div key={i} className="flex justify-between text-ink-muted">
            <span>{formatCurrency(l.price)}</span>
            <span>{l.size}</span>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-1 font-medium text-negative">Asks</p>
        {asks.map((l, i) => (
          <div key={i} className="flex justify-between text-ink-muted">
            <span>{formatCurrency(l.price)}</span>
            <span>{l.size}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HyperliquidMarketRow({ market }: { market: HyperliquidMarketSnapshot }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const positive = market.changePercent24h >= 0;

  return (
    <div className="rounded-xl px-1 py-2.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={expanded}
      >
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[15px] font-medium text-ink">{market.displayName}</p>
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
              {t("market.perpBadge")}
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            {t("market.fundingRate")}: {(market.fundingRate * 100).toFixed(4)}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-[15px] font-medium text-ink">{formatCurrency(market.price)}</p>
            <p className={cn("text-xs font-medium", positive ? "text-positive" : "text-negative")}>
              {formatSignedPercent(market.changePercent24h)}
            </p>
          </div>
          {expanded ? (
            <ChevronUp size={16} className="text-ink-faint" />
          ) : (
            <ChevronDown size={16} className="text-ink-faint" />
          )}
        </div>
      </button>
      <OrderBookLevels coin={market.assetId} expanded={expanded} />
      {expanded ? (
        <>
          <AssetDetailsPanel
            name={market.displayName}
            underlying={getAsset(market.compassAssetId)?.name ?? market.displayName}
            technicalTicker={market.venue === "native" ? `${market.assetId}-PERP` : market.assetId}
            instrumentType={t("market.instrumentTypePerpetual")}
            venue={market.venue}
            dexFullName={market.dexFullName}
          />
          {/* Server only ever returns markets that resolved to an
              approved CompassFinance asset (see getAssetIdForHyperliquidCoin
              in service.ts) — every market reaching this row is tradeable
              by construction, so this link is unconditional once
              expanded. Only shown alongside the order book/Details, not
              on every collapsed row in the list. */}
          <Link
            href={`/hyperliquid/${market.compassAssetId}`}
            className="mt-1.5 block rounded-xl bg-surface-2 px-3 py-2 text-center text-[13px] font-medium text-ink active:opacity-80"
          >
            {t("market.trade")}
          </Link>
        </>
      ) : null}
    </div>
  );
}
