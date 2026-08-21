"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star, Lock, LockOpen, BookOpen, Share2, Check } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { AssetHeader } from "@/components/asset/asset-header";
import { PriceChart } from "@/components/asset/price-chart";
import { TradeSheet } from "@/components/asset/trade-sheet";
import { whatMovesIt } from "@/lib/mock-data";
import { getAsset } from "@/lib/assets/catalog";
import { useProgress } from "@/lib/progress-store";
import { useFavorite } from "@/lib/server-sync/use-favorite";
import { getInvestmentUnlockStage } from "@/lib/learning/unlocks";
import { getLessonHref } from "@/lib/learning/routes";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useAssetQuote } from "@/lib/market/market-provider";
import { isMarketSymbol } from "@/lib/market/market-types";
import { priceFromQuoteResult } from "@/lib/market/quote-to-trade";
import { usePaperAccount, usePosition } from "@/lib/trading/paper-account-provider";
import { useAchievementShare } from "@/lib/share/use-achievement-share";

export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const { isInvestmentUnlocked, getBlockingInvestmentStage, recordAssetView } = useProgress();
  const [showTradeSheet, setShowTradeSheet] = useState(false);
  const { t } = useTranslation();
  const { favorited, toggle: toggleFavorite } = useFavorite(slug);
  // The live quote is the single source of truth for this page's price
  // display, the chart's current level, and the entry price used to open
  // a position — never the static mock `asset.price` below, which is now
  // only used for display metadata (name/symbol/colorKey).
  const { result: quoteResult } = useAssetQuote(isMarketSymbol(slug) ? slug : "sp500");
  const livePrice = priceFromQuoteResult(quoteResult);
  const { account, placeTrade } = usePaperAccount();
  const existingPosition = usePosition(isMarketSymbol(slug) ? slug : "sp500");
  const { share, sharing, shared, isSignedIn: shareSignedIn } = useAchievementShare();

  // Tracks "assets explored" for the learning-progress model. Deferred via
  // setTimeout so this doesn't fire as a synchronous setState call from
  // within the effect body (see recordAssetView in progress-store.tsx).
  // Milestone 8.1: viewing this page is exploration only — it never
  // changes learning or investment access, same as before.
  useEffect(() => {
    const t = setTimeout(() => recordAssetView(slug), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const asset = getAsset(slug);

  if (!asset) {
    return (
      <AppShell>
        <Header title={t("market.asset")} backHref="/" />
        <div className="px-5">
          <Card>
            <p className="text-[14px] text-ink-muted">{t("market.assetNotInDemo")}</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  const stageDef = getInvestmentUnlockStage(slug);
  // Whether a share-worthy "you just unlocked this" moment applies to
  // this asset — any asset that requires completing its own course
  // before investing (stageDef exists), now unlocked. Previously this
  // used GATED_ASSET_IDS (stage > 1 only), which was written when only
  // the later stages required their own lesson — every asset (including
  // sp500, stage 1) now does, so excluding stage 1 silently hid the
  // share banner for the very course the milestone's own example message
  // is about ("I just completed the S&P 500 course..."). Fixed to key
  // off "does this asset require a course at all", which today is every
  // asset, without touching the unlock business rules themselves.
  const unlocked = isInvestmentUnlocked(slug);
  const justUnlocked = Boolean(stageDef) && unlocked;
  // The stage that's ACTUALLY blocking investment right now — for an
  // asset several steps into the ladder (e.g. Tesla needs Apple, which
  // needs Nasdaq, which needs S&P 500), this is whichever of those the
  // learner genuinely hasn't finished yet, not necessarily this asset's
  // own stage. Drives the "Complete X first" messaging and CTA below.
  const blockingStage = getBlockingInvestmentStage(slug);
  const learnHref = getLessonHref(slug);
  const moves = whatMovesIt[asset.category];
  const MOVE_LABEL_KEY: Record<string, string> = {
    Earnings: "market.earnings",
    "Interest rates": "market.interestRates",
    Inflation: "market.inflation",
    "Economic data": "market.economicData",
    "Product news": "market.productNews",
    "Sector trends": "market.sectorTrends",
    "Analyst ratings": "market.analystRatings",
  };

  function handleConfirmBuy(amountUsdc: number): Promise<{ status: "ok" } | { status: "error"; reason: string }> {
    return placeTrade(asset!.id, "BUY", amountUsdc / livePrice!).then((result) =>
      result.status === "ok" ? { status: "ok" as const } : { status: "error" as const, reason: result.reason }
    );
  }

  function handleShareUnlock() {
    const message = `${t("achievementShare.assetMessagePrefix")} ${asset!.name} ${t(
      "achievementShare.assetMessageMiddle"
    )} ${asset!.name} ${t("achievementShare.assetMessageSuffix")}`;
    share("asset-unlock", asset!.id, message);
  }

  return (
    <AppShell>
      <Header
        title={asset.symbol}
        backHref="/"
        rightSlot={
          <button
            aria-label="Add to watchlist"
            onClick={toggleFavorite}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <Star size={19} fill={favorited ? "currentColor" : "none"} />
          </button>
        }
      />

      <div className="space-y-5 px-5">
        <AssetHeader
          name={asset.name}
          price={quoteResult?.status === "ok" ? quoteResult.quote.price : null}
          changePct={quoteResult?.status === "ok" ? quoteResult.quote.changePercent : null}
        />

        {!unlocked ? (
          <Card className="text-center">
            <div className="flex justify-center">
              <IconCircle colorKey="slate" size="lg">
                <Lock size={20} />
              </IconCircle>
            </div>
            <p className="mt-2 text-[15px] font-semibold text-ink">{t("market.investmentLocked")}</p>
            {blockingStage ? (
              <>
                <p className="mt-1 text-[13px] font-medium text-ink">
                  {t("market.completeFirst")}: {blockingStage.name}
                </p>
                <p className="mt-1 text-[13px] text-ink-muted">{blockingStage.unlockDescription}</p>
              </>
            ) : (
              <p className="mt-1 text-[13px] text-ink-muted">
                {stageDef?.unlockDescription ??
                  `Complete the required learning path to unlock ${asset.name}.`}
              </p>
            )}
            <Link
              href={blockingStage ? getLessonHref(blockingStage.assetId) : learnHref}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-medium text-surface active:opacity-90"
            >
              <BookOpen size={14} />
              {blockingStage
                ? `${t("learning.startLearning")}: ${blockingStage.name}`
                : t("learning.startLearning")}
            </Link>
          </Card>
        ) : isMarketSymbol(asset.slug) ? (
          <PriceChart slug={asset.slug} />
        ) : null}

        {justUnlocked ? (
          <Card className="border-positive/30 bg-positive-bg/40">
            <div className="flex items-center gap-3">
              <IconCircle colorKey="green">
                <LockOpen size={16} />
              </IconCircle>
              <p className="flex-1 text-[13px] font-medium text-positive">
                {t("market.newAssetUnlocked")}
              </p>
              {shareSignedIn ? (
                <button
                  type="button"
                  onClick={handleShareUnlock}
                  disabled={sharing}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-positive px-3 py-1.5 text-[12px] font-medium text-surface active:opacity-90 disabled:opacity-50"
                >
                  {shared ? <Check size={13} /> : <Share2 size={13} />}
                  {shared ? t("achievementShare.shared") : t("achievementShare.cta")}
                </button>
              ) : null}
            </div>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-[15px] font-semibold text-ink">{t("market.whatMovesIt")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {moves.map((m) => (
              <span
                key={m.label}
                className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted"
              >
                {MOVE_LABEL_KEY[m.label] ? t(MOVE_LABEL_KEY[m.label]) : m.label}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-[15px] font-semibold text-ink">{t("market.about")}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            {asset.category === "index"
              ? `${asset.name} tracks a basket of leading U.S. companies and is widely used as a benchmark for overall market performance.`
              : `${asset.name} (${asset.symbol}) is one of the most actively followed companies on U.S. markets. This is placeholder demo copy for the prototype.`}
          </p>
        </Card>

        {!unlocked ? (
          <button
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 py-3.5 text-[15px] font-medium text-ink-faint"
          >
            <Lock size={16} />
            {t("market.completeLearningToUnlockInvesting")}
          </button>
        ) : existingPosition ? (
          <button
            onClick={() => router.push(`/position/${slug}`)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
          >
            {t("market.viewOpenPosition")}
          </button>
        ) : (
          <button
            onClick={() => setShowTradeSheet(true)}
            disabled={livePrice == null}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-50"
          >
            {livePrice == null ? "Market data unavailable" : `Buy ${asset.name}`}
          </button>
        )}
      </div>

      {showTradeSheet && livePrice != null ? (
        <TradeSheet
          assetName={asset.name}
          entryPrice={livePrice}
          maxAmountUsdc={account?.cashBalance ?? 0}
          onConfirm={handleConfirmBuy}
          onClose={() => setShowTradeSheet(false)}
          onViewPosition={() => {
            setShowTradeSheet(false);
            router.push(`/position/${slug}`);
          }}
        />
      ) : null}
    </AppShell>
  );
}
