"use client";

// Hyperliquid Trading — Phase 3 built the order PREVIEW; Phase 4 added
// real signed order execution; Phase 5 added the one-time agent-wallet
// approval this page gates on before showing the trading form (see
// hyperliquid-agent-wallet.ts for why: Hyperliquid's L1 trading actions
// sign with a fixed chainId some wallets reject as a mismatch — the
// approveAgent step, still signed by the REAL connected wallet via
// getSigningProvider(), uses a different signing scheme that doesn't have
// that problem, and delegates every later trade to a session-only agent
// key this page never persists). This page never touches a private key
// itself either way — it only ever hands a signer object to
// hyperliquid-order-signer.ts. The simulated/practice investing system
// (src/lib/trading/) is never imported here — this trades against the
// real, connected Hyperliquid account, a completely separate system by
// design (see the Hyperliquid-integration isolation tests).

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { TrendingUp, TrendingDown, Wallet, Loader2, TriangleAlert, Lock, BookOpen, ArrowLeftRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { PriceChart } from "@/components/asset/price-chart";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { PerpOrderPreviewSheet, type PerpOrderExecutionUiState } from "@/components/hyperliquid/perp-order-preview-sheet";
import { FundXyzModal } from "@/components/hyperliquid/fund-xyz-modal";
import { useWallet } from "@/lib/wallet/wallet-provider";
import { useHyperliquidAccount, useHyperliquidDexAccount } from "@/lib/hyperliquid/hyperliquid-account-provider";
import { useHyperliquidAgent } from "@/lib/hyperliquid/hyperliquid-agent-provider";
import { useHyperliquidMarkets } from "@/lib/hyperliquid/hyperliquid-provider";
import { resolveHyperliquidPanelView } from "@/components/portfolio/hyperliquid-account-panel";
import { getHyperliquidCoinForAsset, isTradeableAssetId, getHip3DexName, getHip3DexFullName } from "@/lib/hyperliquid/asset-mapping";
import { getRealTradingAccess } from "@/lib/hyperliquid/real-trading-access";
import type { DexTransferDirection } from "@/lib/hyperliquid/hyperliquid-dex-transfer";
import { getAsset } from "@/lib/assets/catalog";
import { useProgress } from "@/lib/progress-store";
import { getLessonHref } from "@/lib/learning/routes";
import { AssetDetailsPanel } from "@/components/hyperliquid/asset-details-panel";
import {
  buildPerpOrderPreview,
  type PerpOrderValidationError,
  type PerpSide,
} from "@/lib/hyperliquid/perp-order-calculator";
import { signAndSubmitPerpOrder, computeOrderSizeUnits } from "@/lib/hyperliquid/hyperliquid-order-signer";
import type { HyperliquidMarketsFetchResult } from "@/lib/hyperliquid/hyperliquid-types";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { formatCurrency, cn } from "@/lib/utils";

const LEVERAGE_PRESETS = [2, 5, 10, 20];
const MARGIN_PRESET_FRACTIONS = [0.25, 0.5, 0.75, 1];

function validationMessageKey(error: PerpOrderValidationError): string {
  switch (error) {
    case "invalid-amount":
      return "perpTrade.invalidAmount";
    case "invalid-leverage":
      return "perpTrade.invalidLeverage";
    case "leverage-exceeds-max":
      return "perpTrade.leverageExceedsMax";
    case "insufficient-balance":
      return "perpTrade.insufficientBalance";
    case "price-unavailable":
      return "perpTrade.priceUnavailable";
  }
}

export default function HyperliquidTradePage({ params }: { params: Promise<{ coin: string }> }) {
  const { coin: rawSlug } = use(params);
  const slug = rawSlug.toLowerCase();
  const { t } = useTranslation();

  const { status: sessionStatus } = useSession();
  const { status: walletStatus, address, chainId: walletChainId, isConnecting, getSigningProvider } = useWallet();
  const { snapshot, status: accountStatus, errorMessage, refresh: refreshAccount } = useHyperliquidAccount();
  const { agentStatus, agentWallet, errorMessage: agentError, approve: approveAgent } = useHyperliquidAgent();
  const { markets } = useHyperliquidMarkets();
  const { learningProgress, getBlockingInvestmentStage } = useProgress();

  const [side, setSide] = useState<PerpSide>("long");
  const [marginInput, setMarginInput] = useState("");
  const [leverage, setLeverage] = useState(2);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [executionState, setExecutionState] = useState<PerpOrderExecutionUiState>({ stage: "idle" });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fundModalDirection, setFundModalDirection] = useState<DexTransferDirection | null>(null);

  const coin = getHyperliquidCoinForAsset(slug);
  const market = coin ? (markets.find((m) => m.assetId === coin) ?? null) : null;
  const catalogEntry = getAsset(slug);
  // Human-readable primary label — never the raw Hyperliquid ticker (that
  // stays available only in the Details panel below).
  const displayName = catalogEntry?.name ?? rawSlug.toUpperCase();

  // Phase 8 — a HIP-3 asset (e.g. xyz:AAPL) trades against that dex's OWN
  // isolated margin pool, never the main dex's balance (verified live:
  // the same address holds a genuinely different balance per dex). null
  // dex means this is a native asset (btc/eth) — every balance below
  // falls back to the existing main-account hook unchanged.
  const dex = coin ? getHip3DexName(coin) : null;
  const dexFullName = dex ? getHip3DexFullName(dex) : null;
  const xyzAccount = useHyperliquidDexAccount(dex);

  const mainBalance = snapshot?.withdrawableBalance ?? 0;
  const availableBalance = dex ? (xyzAccount.snapshot?.withdrawableBalance ?? 0) : mainBalance;
  const maxLeverage = market?.maxLeverage ?? 1;
  const marginUsdc = Number(marginInput) || 0;

  const view = resolveHyperliquidPanelView({
    walletStatus,
    address,
    sessionStatus,
    accountStatus,
    errorMessage,
  });

  // Phase 7 — real trading requires this asset's course + quiz
  // (isInvestmentUnlocked, same gate Paper Trading BUY already enforces)
  // PLUS a completed practice trade of it. Evaluated purely off
  // learningProgress; the server independently re-checks the same thing
  // (see submitHyperliquidExchangeAction) before ever forwarding a real
  // order, so this client-side gate is a UX courtesy, not the real
  // security boundary.
  const realTradingAccess = getRealTradingAccess(slug, learningProgress);
  const blockingStage = getBlockingInvestmentStage(slug);

  const previewResult = useMemo(
    () =>
      buildPerpOrderPreview({
        side,
        marginUsdc,
        leverage,
        entryPrice: market?.price ?? null,
        maxLeverage,
        availableBalance,
      }),
    [side, marginUsdc, leverage, market?.price, maxLeverage, availableBalance]
  );

  // Real order execution (Phase 4), signed by the Phase 5 agent wallet —
  // no browser-wallet popup per trade, no chainId check to mismatch on.
  // Fetches a FRESH price/network snapshot right before signing — never
  // trusts whatever the 30s-polled useHyperliquidMarkets() state happens
  // to hold at the moment the button is tapped, since that's what the
  // slippage-bounded order price and the mainnet/testnet signing mode are
  // derived from. `address` stays the user's real wallet address even
  // though the agent does the signing — the agent trades ON BEHALF OF
  // that account, which is what the server's pre-flight checks need to
  // look at, not the agent's own (empty) balance.
  async function handleConfirmAndSign() {
    if (!address || !agentWallet || previewResult.status !== "ok") return;

    setExecutionState({ stage: "signing-leverage" });

    let freshMarket: { price: number; assetIndex: number; szDecimals: number } | null = null;
    let isTestnet = false;
    try {
      const res = await fetch("/api/hyperliquid/markets", { signal: AbortSignal.timeout(10_000) });
      const json = (await res.json()) as { isTestnet?: boolean; result: HyperliquidMarketsFetchResult };
      isTestnet = Boolean(json.isTestnet);
      if (json.result.status === "ok") {
        const fresh = json.result.markets.find((m) => m.assetId === coin);
        if (fresh) freshMarket = { price: fresh.price, assetIndex: fresh.assetIndex, szDecimals: fresh.szDecimals };
      }
    } catch {
      // fall through — freshMarket stays null, handled below
    }

    if (!freshMarket) {
      setExecutionState({
        stage: "done",
        result: { status: "rejected", reason: "invalid-request", message: t("perpTrade.priceUnavailable") },
        requestedSize: 0,
        szDecimals: 0,
      });
      return;
    }

    // Same computation signAndSubmitPerpOrder uses internally for the
    // actual order size — kept here too so the result can be compared
    // against what was really requested for partial-fill detection.
    const requestedSize = computeOrderSizeUnits(marginUsdc, leverage, freshMarket.price);

    const result = await signAndSubmitPerpOrder({
      wallet: agentWallet,
      address,
      assetIndex: freshMarket.assetIndex,
      szDecimals: freshMarket.szDecimals,
      side,
      marginUsdc,
      leverage,
      markPrice: freshMarket.price,
      isTestnet,
      onStageChange: (stage) => setExecutionState({ stage }),
    });

    setExecutionState({ stage: "done", result, requestedSize, szDecimals: freshMarket.szDecimals });

    // Real Hyperliquid-side outcomes (or an ambiguous network-failure that
    // might have gone through) all warrant refreshing the real account —
    // a pure wallet-rejection or our own pre-flight rejection never
    // reached Hyperliquid, so there's nothing new to reconcile.
    if (result.status !== "wallet-rejected" && result.status !== "rejected") {
      if (dex) {
        xyzAccount.refresh();
      } else {
        refreshAccount();
      }
    }
  }

  // One-time-per-session approval that activates the agent wallet above —
  // signed by the REAL browser wallet (the only step that still is),
  // using a fresh price/network check the same way handleConfirmAndSign
  // does, since isTestnet must be correct here too.
  async function handleApproveAgent() {
    const provider = getSigningProvider();
    if (!provider || !address) return;

    let isTestnet = false;
    try {
      const res = await fetch("/api/hyperliquid/markets", { signal: AbortSignal.timeout(10_000) });
      const json = (await res.json()) as { isTestnet?: boolean };
      isTestnet = Boolean(json.isTestnet);
    } catch {
      // isTestnet stays false — approveAgent() will still run, just against
      // mainnet's hyperliquidChain classification if this fetch failed.
    }

    await approveAgent({ provider, address, isTestnet, walletChainId });
  }

  function handleClosePreview() {
    setPreviewOpen(false);
    setExecutionState({ stage: "idle" });
  }

  if (!isTradeableAssetId(slug) || !coin) {
    return (
      <AppShell>
        <Header title={catalogEntry?.name ?? rawSlug.toUpperCase()} backHref="/markets" />
        <div className="px-5">
          <Card>
            <p className="text-[14px] text-ink-muted">This market isn&apos;t available for Hyperliquid trading.</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Header title={displayName} backHref="/markets" />
      <div className="space-y-4 px-5">
        {market ? (
          <div>
            <p className="text-[26px] font-semibold text-ink">{formatCurrency(market.price)}</p>
            <p className={cn("text-[13px] font-medium", market.changePercent24h >= 0 ? "text-positive" : "text-negative")}>
              {market.changePercent24h >= 0 ? "+" : ""}
              {market.changePercent24h.toFixed(2)}% · {t("market.fundingRate")} {(market.fundingRate * 100).toFixed(4)}%
            </p>
          </div>
        ) : null}

        <div>
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="text-[12px] font-medium text-ink-muted underline-offset-2 active:opacity-70"
          >
            {detailsOpen ? t("market.hideDetails") : t("market.showDetails")}
          </button>
          {detailsOpen ? (
            <AssetDetailsPanel
              name={displayName}
              underlying={catalogEntry?.name ?? displayName}
              technicalTicker={dex ? coin : `${coin}-PERP`}
              instrumentType={t("market.instrumentTypePerpetual")}
              venue={dex ? "hip3" : "native"}
              dexFullName={dexFullName}
            />
          ) : null}
        </div>

        <PriceChart slug={slug} />

        {view === "not-connected" ? (
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
                <Wallet size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-ink">{t("hyperliquidAccount.notConnected")}</p>
                <p className="text-xs text-ink-muted">{t("perpTrade.connectPrompt")}</p>
              </div>
              <button
                onClick={() => setWalletModalOpen(true)}
                disabled={isConnecting}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-surface active:opacity-90 disabled:opacity-60"
              >
                {isConnecting ? <Loader2 size={14} className="animate-spin" /> : t("wallet.connectWallet")}
              </button>
            </div>
            <WalletConnectModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
          </Card>
        ) : view === "sign-in-required" ? (
          <Card>
            <div className="flex items-center gap-1.5 text-ink-muted">
              <TriangleAlert size={14} />
              <p className="text-[13px]">{t("hyperliquidAccount.signInRequired")}</p>
            </div>
          </Card>
        ) : view === "hyperliquid-disabled" ? (
          <Card>
            <div className="flex items-center gap-1.5 text-ink-muted">
              <TriangleAlert size={14} />
              <p className="text-[13px]">{t("hyperliquidAccount.dataUnavailable")}</p>
            </div>
          </Card>
        ) : realTradingAccess === "LOCKED_EDUCATION" ? (
          <Card className="text-center">
            <div className="flex justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
                <Lock size={18} />
              </div>
            </div>
            <p className="mt-2 text-[15px] font-semibold text-ink">{t("perpTrade.realTradingLockedTitle")}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{t("perpTrade.realTradingLockedEducationBody")}</p>
            <Link
              href={blockingStage ? getLessonHref(blockingStage.assetId) : getLessonHref(slug)}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-medium text-surface active:opacity-90"
            >
              <BookOpen size={14} />
              {blockingStage
                ? `${t("learning.startLearning")}: ${blockingStage.name}`
                : t("learning.startLearning")}
            </Link>
          </Card>
        ) : realTradingAccess === "LOCKED_NO_PRACTICE_TRADE" ? (
          <Card className="text-center">
            <div className="flex justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
                <Lock size={18} />
              </div>
            </div>
            <p className="mt-2 text-[15px] font-semibold text-ink">{t("perpTrade.realTradingLockedPracticeTitle")}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{t("perpTrade.realTradingLockedPracticeBody")}</p>
            <Link
              href={`/asset/${slug}`}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-medium text-surface active:opacity-90"
            >
              {t("perpTrade.practiceInPaperTrading")}
            </Link>
          </Card>
        ) : agentStatus !== "approved" ? (
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
                <Wallet size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-ink">{t("perpTrade.approveAgentTitle")}</p>
                <p className="text-xs text-ink-muted">{t("perpTrade.approveAgentSubtitle")}</p>
              </div>
            </div>
            {agentStatus === "error" && agentError ? (
              <p className="mt-3 text-xs text-negative">{agentError}</p>
            ) : null}
            <button
              onClick={() => void handleApproveAgent()}
              disabled={agentStatus === "approving"}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-60"
            >
              {agentStatus === "approving" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                t("perpTrade.approveAgentButton")
              )}
            </button>
          </Card>
        ) : dex && xyzAccount.status === "loading" ? (
          <Card>
            <div className="flex items-center justify-center py-4">
              <Loader2 size={18} className="animate-spin text-ink-faint" />
            </div>
          </Card>
        ) : dex && availableBalance <= 0 ? (
          <Card className="text-center">
            <div className="flex justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
                <Wallet size={18} />
              </div>
            </div>
            <p className="mt-2 text-[15px] font-semibold text-ink">{t("perpTrade.zeroXyzBalanceTitle")}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{t("perpTrade.zeroXyzBalanceBody")}</p>
            <button
              onClick={() => setFundModalDirection("fund")}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-medium text-surface active:opacity-90"
            >
              {t("perpTrade.fundXyzButton")}
            </button>
          </Card>
        ) : (
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">{t("perpTrade.margin")} (USDC)</h2>
              <span className="text-[13px] text-ink-muted">
                {dex ? t("perpTrade.xyzTradingBalanceLabel") : t("perpTrade.availableBalance")}:{" "}
                {formatCurrency(availableBalance)}
              </span>
            </div>
            {dex ? (
              <button
                onClick={() => setFundModalDirection("withdraw")}
                className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-ink-muted underline-offset-2 active:opacity-70"
              >
                <ArrowLeftRight size={12} />
                {t("perpTrade.withdrawFromXyzButton")}
              </button>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setSide("long")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[14px] font-medium",
                  side === "long" ? "bg-positive-bg text-positive" : "bg-surface-2 text-ink-muted"
                )}
              >
                <TrendingUp size={15} />
                {t("perpTrade.long")}
              </button>
              <button
                onClick={() => setSide("short")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[14px] font-medium",
                  side === "short" ? "bg-negative-bg text-negative" : "bg-surface-2 text-ink-muted"
                )}
              >
                <TrendingDown size={15} />
                {t("perpTrade.short")}
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-surface-2 p-4">
              <input
                type="number"
                min={0}
                step="0.01"
                value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-[24px] font-semibold text-ink outline-none"
                aria-label={t("perpTrade.margin")}
              />
              <input
                type="range"
                min={0}
                max={Math.max(availableBalance, 1)}
                step="0.01"
                value={Math.min(marginUsdc, Math.max(availableBalance, 1))}
                onChange={(e) => setMarginInput(e.target.value)}
                className="mt-2 w-full accent-ink"
              />
              <div className="mt-2 flex gap-1.5">
                {MARGIN_PRESET_FRACTIONS.map((fraction) => (
                  <button
                    key={fraction}
                    onClick={() => setMarginInput((availableBalance * fraction).toFixed(2))}
                    className="flex-1 rounded-full bg-surface px-2 py-1.5 text-[12px] font-medium text-ink-muted active:opacity-80"
                  >
                    {fraction === 1 ? "Max" : `${fraction * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <h3 className="text-[13px] font-medium text-ink-muted">{t("perpTrade.leverage")}</h3>
              <span className="text-[13px] font-semibold text-ink">{leverage}x</span>
            </div>
            <input
              type="range"
              min={1}
              max={Math.max(maxLeverage, 1)}
              step={1}
              value={Math.min(leverage, Math.max(maxLeverage, 1))}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="mt-1 w-full accent-ink"
            />
            <div className="mt-1.5 flex gap-1.5">
              {LEVERAGE_PRESETS.filter((p) => p <= maxLeverage).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setLeverage(preset)}
                  className={cn(
                    "flex-1 rounded-full px-2 py-1.5 text-[12px] font-medium",
                    leverage === preset ? "bg-ink text-surface" : "bg-surface-2 text-ink-muted"
                  )}
                >
                  {preset}x
                </button>
              ))}
              <button
                onClick={() => setLeverage(maxLeverage)}
                className={cn(
                  "flex-1 rounded-full px-2 py-1.5 text-[12px] font-medium",
                  leverage === maxLeverage ? "bg-ink text-surface" : "bg-surface-2 text-ink-muted"
                )}
              >
                {t("perpTrade.maxLeverageLabel")} {maxLeverage}x
              </button>
            </div>

            {previewResult.status === "ok" ? (
              <div className="mt-4 space-y-2 rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-ink-muted">{t("perpTrade.positionSize")}</span>
                  <span className="text-[13px] font-medium text-ink">
                    {formatCurrency(previewResult.preview.notionalValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-ink-muted">{t("perpTrade.estimatedLiquidationPrice")}</span>
                  <span className="text-[13px] font-medium text-ink">
                    {previewResult.preview.liquidationPrice !== null
                      ? formatCurrency(previewResult.preview.liquidationPrice)
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-ink-muted">{t("perpTrade.estimatedFee")}</span>
                  <span className="text-[13px] text-ink-faint">{formatCurrency(previewResult.preview.estimatedFee)}</span>
                </div>
              </div>
            ) : marginUsdc > 0 ? (
              <div className="mt-4 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>{t(validationMessageKey(previewResult.error))}</span>
              </div>
            ) : null}

            <button
              onClick={() => {
                setExecutionState({ stage: "idle" });
                setPreviewOpen(true);
              }}
              disabled={previewResult.status !== "ok"}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-50"
            >
              {t("perpTrade.previewOrder")}
            </button>
            <p className="mt-2 text-center text-xs text-ink-faint">{t("perpTrade.previewOnlyDisclaimer")}</p>
          </Card>
        )}
      </div>

      {previewOpen && previewResult.status === "ok" ? (
        <PerpOrderPreviewSheet
          coin={coin}
          preview={previewResult.preview}
          executionState={executionState}
          onConfirmAndSign={handleConfirmAndSign}
          onClose={handleClosePreview}
        />
      ) : null}

      {fundModalDirection && dex && dexFullName ? (
        <FundXyzModal
          direction={fundModalDirection}
          dex={dex}
          dexFullName={dexFullName}
          mainBalance={mainBalance}
          xyzBalance={availableBalance}
          onClose={() => setFundModalDirection(null)}
          onSuccess={() => {
            refreshAccount();
            xyzAccount.refresh();
          }}
        />
      ) : null}
    </AppShell>
  );
}
