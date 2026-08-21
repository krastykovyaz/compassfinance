"use client";

import { Compass as CompassIcon, Bell } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { HoldingsList } from "@/components/portfolio/holdings-list";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { PortfolioCard } from "@/components/home/portfolio-card";
import { InsightCard } from "@/components/home/insight-card";
import { ContinueLessonCard } from "@/components/home/continue-lesson-card";
import { MarketOverview } from "@/components/home/market-overview";
import { continueLesson } from "@/lib/mock-data";
import { useProgress } from "@/lib/progress-store";
import { useNotifications } from "@/lib/notifications/notifications-provider";
import { usePaperAccount, usePerformanceHistory } from "@/lib/trading/paper-account-provider";
import { accountToHoldings } from "@/lib/trading/holdings";
import { sp500LessonSteps, sp500Quiz } from "@/lib/lesson-content";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { getGreetingParts, getGreetingPeriod } from "@/lib/home/greeting";

function useJourneyCard(
  t: (key: string) => string,
  hasClosedSp500Position: boolean,
  hasOpenSp500Position: boolean
) {
  const { state, isInvestmentUnlocked } = useProgress();

  if (hasClosedSp500Position) {
    const nasdaqUnlocked = isInvestmentUnlocked("nasdaq");
    return {
      href: nasdaqUnlocked ? "/asset/nasdaq" : "/explore",
      title: t("journey.exploreNasdaq100"),
      levelLabel: nasdaqUnlocked ? t("journey.unlocked") : t("journey.locked"),
      progressPct: 100,
    };
  }

  if (hasOpenSp500Position) {
    return {
      href: "/position/sp500",
      title: t("journey.monitorSp500Position"),
      levelLabel: continueLesson.levelLabel,
      progressPct: 100,
    };
  }

  if (state.quizCompleted) {
    return {
      href: "/asset/sp500",
      title: t("journey.practiceSp500"),
      levelLabel: continueLesson.levelLabel,
      progressPct: 100,
    };
  }

  if (state.lessonCompleted) {
    const quizPct = Math.round(
      (Object.keys(state.quizAnswers).length / sp500Quiz.length) * 100
    );
    return {
      href: "/learn/indices/sp500",
      title: t("journey.completeQuizSp500"),
      levelLabel: continueLesson.levelLabel,
      progressPct: quizPct,
    };
  }

  const lessonPct = Math.round(
    (state.lessonStepIndex / sp500LessonSteps.length) * 100
  );
  return {
    href: "/learn/indices/sp500",
    title:
      state.lessonStepIndex > 0
        ? t("journey.continueSp500Lesson")
        : t("journey.startSp500Lesson"),
    levelLabel: continueLesson.levelLabel,
    progressPct: lessonPct,
  };
}

export default function HomePage() {
  const { t } = useTranslation();
  const { status, data: session } = useSession();
  const { account } = usePaperAccount();
  const hasOpenSp500Position = account?.positions.some((p) => p.assetId === "sp500") ?? false;
  const hasClosedSp500Position =
    account?.trades.some((tr) => tr.assetId === "sp500" && tr.side === "SELL") ?? false;
  const journey = useJourneyCard(t, hasClosedSp500Position, hasOpenSp500Position);

  // Greeting: Auth.js session is the ONLY user/name source (never
  // mock-data's `user`, never a second auth state). No name is shown at
  // all until `status === "authenticated"`, and only when the session
  // actually carries a usable name — see getGreetingParts()'s null cases.
  const period = useMemo(() => getGreetingPeriod(), []);
  const { key: greetingKey, name: greetingName } = getGreetingParts(
    status === "authenticated",
    session?.user?.name,
    period
  );

  // Real account numbers — no mock portfolio value/P&L/buying power.
  // There's no stored daily-open snapshot yet, so "today's change" is
  // shown as the account's total unrealized P&L rather than an invented
  // daily figure (see PortfolioCard's "Unrealized P&L" label).
  const portfolioValue = account?.portfolioValue ?? 0;
  const unrealizedPnl = account?.unrealizedPnl ?? 0;
  const investedValue = account?.investedValue ?? 0;
  const unrealizedPnlPct = investedValue !== 0 ? (unrealizedPnl / investedValue) * 100 : 0;
  const cashBalance = account?.cashBalance ?? 0;
  const { points: performancePoints } = usePerformanceHistory("1D");
  const holdings = accountToHoldings(account).slice(0, 3);
  const { unreadCount } = useNotifications();

  return (
    <AppShell>
      <Header
        title="CompassFinance"
        logo={
          <div className="mr-1 flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-surface">
            <CompassIcon size={18} />
          </div>
        }
        rightSlot={
          <Link
            href="/notifications"
            aria-label={t("linkRows.notifications")}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <Bell size={20} />
            {unreadCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Link>
        }
      />

      <div className="space-y-5 px-5">
        <div>
          <p className="text-[22px] font-semibold tracking-tight text-ink">
            {greetingName ? `${t(greetingKey)}, ${greetingName}` : t(greetingKey)} 👋
          </p>
          <p className="text-[14px] text-ink-muted">{t("home.tagline")}</p>
        </div>

        <PortfolioCard
          value={portfolioValue}
          changePct={unrealizedPnlPct}
          todayPnl={unrealizedPnl}
          buyingPower={cashBalance}
          sparkline={performancePoints}
        />

        {holdings.length > 0 ? (
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">{t("portfolio.holdings")}</h2>
              <Link
                href="/portfolio"
                className="rounded text-[13px] font-medium text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
              >
                {t("general.seeAll")}
              </Link>
            </div>
            <HoldingsList holdings={holdings} />
          </Card>
        ) : null}

        <InsightCard />

        <ContinueLessonCard
          slug={continueLesson.slug}
          href={journey.href}
          title={journey.title}
          levelLabel={journey.levelLabel}
          progressPct={journey.progressPct}
        />

        <MarketOverview />
      </div>
    </AppShell>
  );
}
