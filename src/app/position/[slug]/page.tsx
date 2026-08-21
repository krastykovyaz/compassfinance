"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { PositionCard } from "@/components/asset/position-card";
import { TradeResult } from "@/components/asset/trade-result";
import { getAsset } from "@/lib/assets/catalog";
import { isMarketSymbol } from "@/lib/market/market-types";
import { usePaperAccount, usePosition } from "@/lib/trading/paper-account-provider";

export default function PositionMonitorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const asset = getAsset(slug);
  const marketSlug = isMarketSymbol(slug) ? slug : "sp500";
  const position = usePosition(marketSlug);
  const { placeTrade } = usePaperAccount();

  const [result, setResult] = useState<{ pnlPct: number; pnlUsdc: number } | null>(null);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asset) {
    return (
      <AppShell>
        <Header title="Position" backHref="/" />
        <div className="px-5">
          <Card>
            <p className="text-[14px] text-ink-muted">Unknown asset.</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Nothing held and nothing just sold in this render — send the learner back.
  if (!position && !result) {
    return (
      <AppShell>
        <Header title={asset.name} backHref={`/asset/${slug}`} />
        <div className="px-5">
          <Card className="text-center">
            <p className="text-[14px] text-ink-muted">
              No position — you don&apos;t currently own any {asset.name}.
            </p>
            <button
              onClick={() => router.push(`/asset/${slug}`)}
              className="mt-4 w-full rounded-2xl bg-ink py-3 text-[14px] font-medium text-surface"
            >
              Go to {asset.name}
            </button>
          </Card>
        </div>
      </AppShell>
    );
  }

  async function handleSell() {
    if (!position) return;
    setSelling(true);
    setError(null);
    const res = await placeTrade(marketSlug, "SELL", position.quantity);
    setSelling(false);
    if (res.status === "error") {
      setError(res.reason);
      return;
    }
    const closedTrade = res.account.trades.find(
      (t) => t.assetId === marketSlug && t.side === "SELL"
    );
    const pnlUsdc = closedTrade?.realizedPnl ?? 0;
    const costBasis = position.quantity * position.averageEntryPrice;
    const pnlPct = costBasis !== 0 ? (pnlUsdc / costBasis) * 100 : 0;
    setResult({ pnlPct, pnlUsdc });
  }

  // costBasis stands in for the old flat "amountUsdc" PositionCard expects
  // — it's real money now (quantity * average entry price), not a fixed
  // $10 practice stake.
  const costBasis = position ? position.quantity * position.averageEntryPrice : 0;
  const chartSeries = position
    ? [
        { t: 0, v: position.averageEntryPrice },
        { t: 1, v: position.currentPrice ?? position.averageEntryPrice },
      ]
    : [];

  return (
    <AppShell>
      <Header title={asset.name} backHref={result ? "/portfolio" : `/asset/${slug}`} />

      <div className="space-y-4 px-5">
        {!result && position ? (
          <>
            <PositionCard
              assetName={asset.name}
              entryPrice={position.averageEntryPrice}
              currentPrice={position.currentPrice ?? position.averageEntryPrice}
              amountUsdc={costBasis}
              series={chartSeries}
            />
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border p-3.5">
              <div>
                <p className="text-[11px] text-ink-muted">Quantity</p>
                <p className="text-sm font-medium text-ink">{position.quantity.toFixed(6)}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-muted">Market value</p>
                <p className="text-sm font-medium text-ink">
                  {position.marketValue != null ? `$${position.marketValue.toFixed(2)}` : "—"}
                </p>
              </div>
            </div>
            {position.currentPrice == null ? (
              <p className="text-center text-[12px] text-ink-faint">
                Market data unavailable — waiting for a live quote to sell this position.
              </p>
            ) : null}
            {error ? (
              <p className="text-center text-[12px] font-medium text-negative">{error}</p>
            ) : null}
            <button
              onClick={handleSell}
              disabled={position.currentPrice == null || selling}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-50"
            >
              {selling ? "Selling…" : "Sell position"}
            </button>
          </>
        ) : null}

        {result ? (
          <>
            <TradeResult pnlPct={result.pnlPct} xpEarned={0} assetName={asset.name} />
            <button
              onClick={() => router.push("/portfolio")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
            >
              Back to Portfolio
            </button>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
