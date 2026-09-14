"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { PaperTradingCard } from "@/components/portfolio/paper-trading-card";
import { HyperliquidPortfolioCard } from "@/components/portfolio/hyperliquid-portfolio-card";
import { Trading212AccountPanel } from "@/components/portfolio/trading212-account-panel";
import { InteractiveBrokersAccountPanel } from "@/components/portfolio/interactive-brokers-account-panel";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useSetCompassContext } from "@/lib/compass/compass-provider";
import type { PortfolioContextSource } from "@/lib/compass/context";

type PortfolioTab = "all" | "paper" | "trading212" | "interactive_brokers" | "hyperliquid";

const TAB_TO_COMPASS_SOURCE: Record<PortfolioTab, PortfolioContextSource> = {
  all: "ALL",
  paper: "PAPER",
  trading212: "TRADING212",
  interactive_brokers: "IBKR",
  hyperliquid: "HYPERLIQUID",
};

// Requirement (Paper/Real redesign): Paper Trading (simulated), Trading
// 212, Interactive Brokers, and Hyperliquid (three INDEPENDENT real
// accounts) are always rendered as separate sections with their own real
// numbers — there is NO combined "Total Portfolio Value" anywhere on this
// page, and never will be, since paper money and three genuinely
// different real accounts are never the same account. Each real source
// gets its own tab (not one merged "Real" bucket) for the same reason: a
// "Real" filter that showed all of them together risked reading as one
// combined real balance even without a computed total. The tab control
// below is a pure UI filter over which sections are visible; it never
// triggers a different data fetch or computes any cross-source total.
export default function PortfolioPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PortfolioTab>("all");
  const compassSource = TAB_TO_COMPASS_SOURCE[tab];
  useSetCompassContext({ type: "PORTFOLIO", source: compassSource });

  const showPaper = tab === "all" || tab === "paper";
  const showTrading212 = tab === "all" || tab === "trading212";
  const showInteractiveBrokers = tab === "all" || tab === "interactive_brokers";
  const showHyperliquid = tab === "all" || tab === "hyperliquid";
  // The grouping heading only makes sense when both real sources are
  // visible together (the "all" tab) — on a single-source tab, the tab
  // itself already says which account this is, so repeating "Real
  // Portfolios" above one lone card would be redundant framing.
  const showRealPortfoliosHeading = tab === "all";

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
        <div className="-mx-5 overflow-x-auto px-5">
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={[
              { id: "all", label: t("portfolio.tabAll") },
              { id: "paper", label: t("portfolio.tabPaper") },
              { id: "trading212", label: t("portfolio.tabTrading212") },
              { id: "interactive_brokers", label: t("portfolio.tabInteractiveBrokers") },
              { id: "hyperliquid", label: t("portfolio.tabHyperliquid") },
            ]}
          />
        </div>

        {showPaper ? <PaperTradingCard /> : null}

        {showTrading212 || showInteractiveBrokers || showHyperliquid ? (
          <>
            {showRealPortfoliosHeading ? (
              <div>
                <h2 className="px-1 text-[15px] font-semibold text-ink">{t("portfolio.realPortfoliosHeading")}</h2>
                <p className="px-1 text-[12px] text-ink-muted">{t("portfolio.realPortfoliosSubheading")}</p>
              </div>
            ) : null}
            {showTrading212 ? <Trading212AccountPanel /> : null}
            {showInteractiveBrokers ? <InteractiveBrokersAccountPanel /> : null}
            {showHyperliquid ? <HyperliquidPortfolioCard /> : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
