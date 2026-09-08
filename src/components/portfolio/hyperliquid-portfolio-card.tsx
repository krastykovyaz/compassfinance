"use client";

import { useEffect, useState } from "react";
import { Wallet, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useSession } from "next-auth/react";
import { DarkCard } from "@/components/ui/card";
import { useWallet } from "@/lib/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { useHyperliquidAccount } from "@/lib/hyperliquid/hyperliquid-account-provider";
import { HyperliquidAccountPanel, resolveHyperliquidPanelView } from "@/components/portfolio/hyperliquid-account-panel";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

const BENEFIT_KEYS = ["benefitPositions", "benefitMarkets", "benefitLiveData"] as const;

// Wraps the existing, feature-rich HyperliquidAccountPanel (real trading:
// close position, agent approval, HIP-3 dex funding — left entirely
// untouched here, no risk to those flows) with a compact summary + a
// real, working "not connected" CTA for the Real Portfolios section.
// Deliberately a wrapper rather than a rewrite of that 500+ line panel:
// every state OTHER than "not connected" (wallet connected, no data yet)
// and "content" (connected, real snapshot in hand) just delegates
// straight through to the existing panel, so sign-in-required/loading/
// error/disabled states keep their already-correct behavior unchanged.
export function HyperliquidPortfolioCard() {
  const { t } = useTranslation();
  const { status: sessionStatus } = useSession();
  const { status: walletStatus, address, isConnecting } = useWallet();
  const { snapshot, status: accountStatus, errorMessage } = useHyperliquidAccount();
  const [modalOpen, setModalOpen] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Hyperliquid's own account data has no stored "last synced" timestamp
  // anywhere (it's fetched live, not periodically synced like Trading
  // 212) — this records the real moment THIS browser last successfully
  // loaded it, which is honestly what "last updated" means for a
  // live-fetched account, never a fabricated or guessed time.
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (accountStatus !== "ok" && accountStatus !== "empty") return;
    const kickoff = setTimeout(() => setLastUpdatedAt(new Date()), 0);
    return () => clearTimeout(kickoff);
  }, [accountStatus]);

  const view = resolveHyperliquidPanelView({ walletStatus, address, sessionStatus, accountStatus, errorMessage });

  if (view === "not-connected") {
    return (
      <DarkCard>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dark-card-2 text-dark-ink-muted">
            <Wallet size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-dark-ink">{t("portfolioSources.hyperliquidLabel")}</p>
            <p className="text-xs text-dark-ink-muted">{t("hyperliquidAccount.notConnectedBadge")}</p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-dark-ink-muted">{t("hyperliquidAccount.connectPromptFull")}</p>
        <ul className="mt-3 space-y-1.5">
          {BENEFIT_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-2 text-[13px] text-dark-ink-muted">
              <Check size={14} className="shrink-0 text-positive" />
              {t(`hyperliquidAccount.${key}`)}
            </li>
          ))}
        </ul>
        <button
          onClick={() => setModalOpen(true)}
          disabled={isConnecting}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-blue px-4 py-2.5 text-[13px] font-medium text-white active:opacity-90 disabled:opacity-60"
        >
          {isConnecting ? <Loader2 size={14} className="animate-spin" /> : t("wallet.connectWallet")}
        </button>
        <button
          onClick={() => setLearnMoreOpen((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1 py-1.5 text-[12px] font-medium text-dark-ink-muted"
        >
          {t("portfolio.learnMore")} {learnMoreOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {learnMoreOpen ? <p className="mt-1 text-[12px] text-dark-ink-muted">{t("hyperliquidAccount.realTradingSubheading")}</p> : null}
        <WalletConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </DarkCard>
    );
  }

  // Every other non-"content" state (sign-in-required/loading/error/
  // disabled) — the existing panel already handles these correctly, no
  // compact treatment needed for edge/transient states.
  if (view !== "content" || !snapshot) {
    return <HyperliquidAccountPanel />;
  }

  if (!expanded) {
    return (
      <DarkCard>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dark-card-2 text-dark-ink-muted">
            <Wallet size={18} />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-dark-ink">
              {t("portfolioSources.hyperliquidLabel")}
              <span className="rounded-full bg-positive/15 px-2 py-0.5 text-[11px] font-medium text-positive">
                {t("hyperliquidAccount.connectedBadge")}
              </span>
            </p>
          </div>
        </div>

        <p className="mt-3 text-[24px] font-semibold tracking-tight text-dark-ink">{formatCurrency(snapshot.accountValue)}</p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-[11px] text-dark-ink-muted">{t("hyperliquidAccount.positions")}</p>
            <p className="text-[13px] font-semibold text-dark-ink">{snapshot.positions.length}</p>
          </div>
          <div>
            <p className="text-[11px] text-dark-ink-muted">{t("hyperliquidAccount.lastUpdated")}</p>
            <p className="text-[13px] font-semibold text-dark-ink">
              {lastUpdatedAt ? formatRelativeTime(lastUpdatedAt.toISOString()) : t("hyperliquidAccount.justNow")}
            </p>
          </div>
        </div>

        <button
          onClick={() => setExpanded(true)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-full border border-dark-border py-2 text-[13px] font-medium text-dark-ink hover:bg-dark-card-2"
        >
          {t("hyperliquidAccount.viewPositions")} <ChevronDown size={14} />
        </button>
      </DarkCard>
    );
  }

  return (
    <>
      <button
        onClick={() => setExpanded(false)}
        className="mb-2 flex w-full items-center justify-center gap-1 rounded-full border border-border py-2 text-[13px] font-medium text-ink-muted hover:bg-surface-2"
      >
        {t("market.hideDetails")} <ChevronUp size={14} />
      </button>
      <HyperliquidAccountPanel />
    </>
  );
}
