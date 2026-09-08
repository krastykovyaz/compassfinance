"use client";

import { useState } from "react";
import { LineChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { PerformanceChart } from "@/components/portfolio/performance-chart";
import { HoldingsList } from "@/components/portfolio/holdings-list";
import { usePaperAccount } from "@/lib/trading/paper-account-provider";
import { accountToHoldings } from "@/lib/trading/holdings";
import { formatCurrency, formatSignedPercent, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

const INITIAL_HOLDINGS_SHOWN = 3;

// The ONE simulated-money card on the Portfolio page — everything here
// comes from the same paper account Home/Position/Markets already read
// from (no separate mock number). The "Demo" badge plus the "unrealized"
// wording (never "real portfolio value") are the whole point: this card
// must never be mistaken for a real brokerage/wallet balance, which is
// exactly why it never appears alongside Trading 212/Hyperliquid inside
// one combined total anywhere on this page.
export function PaperTradingCard() {
  const { account } = usePaperAccount();
  const { t } = useTranslation();
  const [showAllHoldings, setShowAllHoldings] = useState(false);

  const portfolioValue = account?.portfolioValue ?? 0;
  const investedValue = account?.investedValue ?? 0;
  const unrealizedPnl = account?.unrealizedPnl ?? 0;
  const unrealizedPnlPct = investedValue !== 0 ? (unrealizedPnl / investedValue) * 100 : 0;
  const positive = unrealizedPnlPct >= 0;

  const holdings = accountToHoldings(account);
  const visibleHoldings = showAllHoldings ? holdings : holdings.slice(0, INITIAL_HOLDINGS_SHOWN);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <IconCircle colorKey="blue" size="sm">
          <LineChart size={16} />
        </IconCircle>
        <h2 className="text-[15px] font-semibold text-ink">{t("portfolio.paperTradingTitle")}</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
          {t("portfolio.demoBadge")}
        </span>
      </div>

      <p className="mt-2 text-[24px] font-semibold tracking-tight text-ink">{formatCurrency(portfolioValue)}</p>
      <span className={cn("text-[13px] font-medium", positive ? "text-positive" : "text-negative")}>
        {formatSignedPercent(unrealizedPnlPct)} {t("portfolio.unrealizedSuffix")}
      </span>

      <div className="mt-3">
        <PerformanceChart />
      </div>

      <h3 className="mt-3 text-[13px] font-medium text-ink-muted">{t("portfolio.holdings")}</h3>
      {holdings.length > 0 ? (
        <>
          <HoldingsList holdings={visibleHoldings} />
          {!showAllHoldings && holdings.length > INITIAL_HOLDINGS_SHOWN ? (
            <button
              onClick={() => setShowAllHoldings(true)}
              className="mt-1 flex w-full items-center justify-center gap-1 py-2 text-[13px] font-medium text-blue"
            >
              {t("portfolio.viewAllPaperHoldings")} →
            </button>
          ) : null}
        </>
      ) : (
        <p className="py-6 text-center text-[13px] text-ink-muted">{t("portfolio.noHoldingsYet")}</p>
      )}
    </Card>
  );
}
