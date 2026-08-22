"use client";

// Hyperliquid Trading Phase 3 — order PREVIEW only. Reuses the existing
// wallet (useWallet) and Hyperliquid account (useHyperliquidAccount) state
// exactly as Phase 2 built them — no new wallet/account state anywhere in
// this file. There is no order-submission call anywhere on this page: the
// "Preview Order" button only opens a read-only summary
// (PerpOrderPreviewSheet); nothing here ever POSTs to Hyperliquid or
// requests a wallet signature. The simulated/practice investing system
// (src/lib/trading/) is never imported here — this trades against the
// real, connected Hyperliquid account, a completely separate system by
// design (see the Hyperliquid-integration isolation tests).

import { use, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { TrendingUp, TrendingDown, Wallet, Loader2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { PriceChart } from "@/components/asset/price-chart";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { PerpOrderPreviewSheet } from "@/components/hyperliquid/perp-order-preview-sheet";
import { useWallet } from "@/lib/wallet/wallet-provider";
import { useHyperliquidAccount } from "@/lib/hyperliquid/hyperliquid-account-provider";
import { useHyperliquidMarkets } from "@/lib/hyperliquid/hyperliquid-provider";
import { resolveHyperliquidPanelView } from "@/components/portfolio/hyperliquid-account-panel";
import { getHyperliquidCoinForAsset } from "@/lib/hyperliquid/asset-mapping";
import {
  buildPerpOrderPreview,
  type PerpOrderValidationError,
  type PerpSide,
} from "@/lib/hyperliquid/perp-order-calculator";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { formatCurrency, cn } from "@/lib/utils";

const SUPPORTED_SLUGS = ["btc", "eth"] as const;
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
  const { status: walletStatus, address, isConnecting } = useWallet();
  const { snapshot, status: accountStatus, errorMessage } = useHyperliquidAccount();
  const { markets } = useHyperliquidMarkets();

  const [side, setSide] = useState<PerpSide>("long");
  const [marginInput, setMarginInput] = useState("");
  const [leverage, setLeverage] = useState(2);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const coin = getHyperliquidCoinForAsset(slug);
  const market = coin ? (markets.find((m) => m.assetId === coin) ?? null) : null;
  const displayName = coin ?? rawSlug.toUpperCase();

  const availableBalance = snapshot?.withdrawableBalance ?? 0;
  const maxLeverage = market?.maxLeverage ?? 1;
  const marginUsdc = Number(marginInput) || 0;

  const view = resolveHyperliquidPanelView({
    walletStatus,
    address,
    sessionStatus,
    accountStatus,
    errorMessage,
  });

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

  if (!(SUPPORTED_SLUGS as readonly string[]).includes(slug) || !coin) {
    return (
      <AppShell>
        <Header title={rawSlug.toUpperCase()} backHref="/markets" />
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
      <Header title={`${displayName}-PERP`} backHref="/markets" />
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

        <PriceChart slug={slug as "btc" | "eth"} />

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
        ) : (
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">{t("perpTrade.margin")} (USDC)</h2>
              <span className="text-[13px] text-ink-muted">
                {t("perpTrade.availableBalance")}: {formatCurrency(availableBalance)}
              </span>
            </div>

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
              onClick={() => setPreviewOpen(true)}
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
        <PerpOrderPreviewSheet coin={coin} preview={previewResult.preview} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </AppShell>
  );
}
