"use client";

import { Eye } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { PerformanceChart } from "@/components/portfolio/performance-chart";
import { HoldingsList } from "@/components/portfolio/holdings-list";
import { HyperliquidPanel } from "@/components/portfolio/hyperliquid-panel";
import { hyperliquidAccount } from "@/lib/mock-data";
import { usePaperAccount } from "@/lib/trading/paper-account-provider";
import { accountToHoldings } from "@/lib/trading/holdings";
import { formatCurrency, formatSignedPercent } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function PortfolioPage() {
  const { account } = usePaperAccount();
  const { t } = useTranslation();

  // Real numbers from the same paper account Home/Position/Markets read
  // from — no mock portfolio value, no separate local state. "Change" is
  // shown as total unrealized P&L (no daily-open snapshot is tracked yet
  // to compute a true daily figure — see PortfolioCard for the same call).
  const portfolioValue = account?.portfolioValue ?? 0;
  const investedValue = account?.investedValue ?? 0;
  const unrealizedPnl = account?.unrealizedPnl ?? 0;
  const unrealizedPnlPct = investedValue !== 0 ? (unrealizedPnl / investedValue) * 100 : 0;

  // Real holdings, mapped into the existing HoldingsList's shape — same
  // component/visual design, just fed real positions instead of the old
  // mock `holdings` array. Shared with Home's preview card via
  // accountToHoldings() rather than two copies of the same mapping.
  const holdings = accountToHoldings(account);

  return (
    <AppShell>
      <Header
        title={t("portfolio.portfolio")}
        rightSlot={
          <button
            aria-label="Toggle balance visibility"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <Eye size={20} />
          </button>
        }
      />

      <div className="space-y-5 px-5">
        <div>
          <p className="text-[13px] font-medium text-ink-muted">
            {t("portfolio.totalPortfolioValue")}
          </p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-ink">
            {formatCurrency(portfolioValue)}
          </p>
          <span
            className={
              unrealizedPnlPct >= 0
                ? "text-[13px] font-medium text-positive"
                : "text-[13px] font-medium text-negative"
            }
          >
            {formatSignedPercent(unrealizedPnlPct)} unrealized
          </span>
        </div>

        <Card>
          <PerformanceChart />
        </Card>

        <Card>
          <h2 className="text-[15px] font-semibold text-ink">{t("portfolio.holdings")}</h2>
          {holdings.length > 0 ? (
            <HoldingsList holdings={holdings} />
          ) : (
            <p className="py-6 text-center text-[13px] text-ink-muted">
              No holdings yet — buy an asset from Markets to see it here.
            </p>
          )}
        </Card>

        <HyperliquidPanel
          accountLabel={hyperliquidAccount.accountLabel}
          network={hyperliquidAccount.network}
        />
      </div>
    </AppShell>
  );
}
