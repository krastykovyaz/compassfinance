"use client";

// Phase 8 — the funding/withdraw flow that moves USDC between the main
// Hyperliquid balance and a HIP-3 dex's own ISOLATED margin pool (see
// asset-mapping.ts's header comment for why these are genuinely separate
// pools, not a filtered view of one balance). Self-contained (owns its
// own signing/submission state) rather than a controlled component like
// close-position-modal.tsx, since this is opened from more than one
// place (the trading page and the Portfolio panel) that would otherwise
// each need to duplicate the same signAndSubmitDexTransfer orchestration.
//
// Reuses the EXACT same wallet-signing infrastructure as every other
// real action in this integration (hyperliquid-dex-transfer.ts, itself
// built on hyperliquid-order-signer.ts's wallet adapter) — no second
// execution system, no new key material, always an explicit wallet
// signature.

import { useState } from "react";
import { TriangleAlert, X, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useWallet } from "@/lib/wallet/wallet-provider";
import { signAndSubmitDexTransfer, type DexTransferDirection, type DexTransferResult } from "@/lib/hyperliquid/hyperliquid-dex-transfer";
import type { HyperliquidMarketsFetchResult } from "@/lib/hyperliquid/hyperliquid-types";

const PRESET_FRACTIONS = [0.25, 0.5, 0.75, 1];

type TransferUiState = { stage: "idle" } | { stage: "signing" | "submitting" } | { stage: "done"; result: DexTransferResult };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[13px] font-medium text-ink">{value}</span>
    </div>
  );
}

function TransferResultBanner({ result }: { result: DexTransferResult }) {
  const { t } = useTranslation();
  if (result.status === "wallet-rejected") {
    return (
      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-ink-muted">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>{t("perpTrade.walletRejected")}</span>
      </div>
    );
  }
  if (result.status === "pending" || result.status === "resting" || result.status === "filled") {
    return (
      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-positive-bg px-3 py-2.5 text-xs text-positive">
        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
        <span>{t("perpTrade.transferSubmitted")}</span>
      </div>
    );
  }
  if (result.status === "network-failure") {
    return (
      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2.5 text-xs text-negative">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>{t("perpTrade.unconfirmed")}</span>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2.5 text-xs text-negative">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <span>{result.message}</span>
    </div>
  );
}

export function FundXyzModal({
  direction,
  dex,
  dexFullName,
  mainBalance,
  xyzBalance,
  onClose,
  onSuccess,
}: {
  direction: DexTransferDirection;
  dex: string;
  dexFullName: string;
  mainBalance: number;
  xyzBalance: number;
  onClose: () => void;
  /** Called after a transfer that reached Hyperliquid (success or
   * ambiguous network-failure) — never for a wallet-rejection or a
   * pre-flight rejection, since nothing upstream changed in those cases. */
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { address, chainId: walletChainId, getSigningProvider } = useWallet();
  const [amountInput, setAmountInput] = useState("");
  const [executionState, setExecutionState] = useState<TransferUiState>({ stage: "idle" });

  const sourceBalance = direction === "fund" ? mainBalance : xyzBalance;
  const amount = Number(amountInput) || 0;
  const isValidAmount = amount > 0 && amount <= sourceBalance;
  const isActive = executionState.stage === "signing" || executionState.stage === "submitting";
  const isDone = executionState.stage === "done";
  const result = isDone ? executionState.result : null;
  const succeeded = result ? result.status !== "wallet-rejected" && result.status !== "rejected" : false;

  const resultingXyzBalance = direction === "fund" ? xyzBalance + amount : Math.max(xyzBalance - amount, 0);
  const resultingMainBalance = direction === "fund" ? Math.max(mainBalance - amount, 0) : mainBalance + amount;

  function handleClose() {
    if (isActive) return; // don't allow closing mid-signature/submission
    if (succeeded) onSuccess();
    onClose();
  }

  async function handleConfirm() {
    const provider = getSigningProvider();
    if (!provider || !address || !isValidAmount) return;

    setExecutionState({ stage: "signing" });

    let isTestnet = false;
    let usdcTokenId: string | null = null;
    try {
      const res = await fetch("/api/hyperliquid/markets", { signal: AbortSignal.timeout(10_000) });
      const json = (await res.json()) as { isTestnet?: boolean; usdcTokenId?: string | null; result: HyperliquidMarketsFetchResult };
      isTestnet = Boolean(json.isTestnet);
      usdcTokenId = json.usdcTokenId ?? null;
    } catch {
      // usdcTokenId stays null — handled below
    }

    if (!usdcTokenId) {
      setExecutionState({
        stage: "done",
        result: { status: "rejected", reason: "invalid-request", message: t("perpTrade.priceUnavailable") },
      });
      return;
    }

    setExecutionState({ stage: "submitting" });
    const result = await signAndSubmitDexTransfer({
      provider,
      address: address as `0x${string}`,
      direction,
      dex,
      amountUsdc: amountInput,
      usdcTokenId,
      isTestnet,
      walletChainId,
    });

    setExecutionState({ stage: "done", result });
  }

  const title = direction === "fund" ? t("perpTrade.fundXyzTitle") : t("perpTrade.withdrawXyzTitle");
  const subtitle = direction === "fund" ? t("perpTrade.fundXyzSubtitle") : t("perpTrade.withdrawXyzSubtitle");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label={t("general.close")}
        onClick={handleClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-[420px] rounded-t-[28px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-2" />

        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          {!isActive ? (
            <button
              aria-label={t("general.close")}
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>

        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-medium text-ink-muted">
          <span>{direction === "fund" ? t("perpTrade.mainHyperliquidBalance") : dexFullName}</span>
          <ArrowRight size={14} />
          <span>{direction === "fund" ? dexFullName : t("perpTrade.mainHyperliquidBalance")}</span>
        </div>

        <div className="mt-4 rounded-2xl bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-muted">{t("perpTrade.fundAmount")}</p>
            <p className="text-[13px] text-ink-muted">
              {t("perpTrade.availableBalance")}: {formatCurrency(sourceBalance)}
            </p>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <input
              type="number"
              min={0}
              max={sourceBalance}
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={isActive || isDone}
              placeholder="0"
              className="w-full bg-transparent text-[24px] font-semibold text-ink outline-none disabled:opacity-60"
              aria-label={t("perpTrade.fundAmount")}
            />
            <span className="shrink-0 text-[15px] font-medium text-ink-muted">USDC</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(sourceBalance, 1)}
            step="0.01"
            value={Math.min(amount, Math.max(sourceBalance, 1))}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={isActive || isDone}
            className="mt-2 w-full accent-ink disabled:opacity-60"
          />
          <div className="mt-2 flex gap-1.5">
            {PRESET_FRACTIONS.map((fraction) => (
              <button
                key={fraction}
                type="button"
                onClick={() => setAmountInput((sourceBalance * fraction).toFixed(2))}
                disabled={isActive || isDone}
                className="flex-1 rounded-full bg-surface px-2 py-1.5 text-[12px] font-medium text-ink-muted active:opacity-80 disabled:opacity-60"
              >
                {fraction === 1 ? t("perpTrade.maxLeverageLabel") : `${fraction * 100}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-2.5 rounded-2xl border border-border p-4">
          <Row label={t("perpTrade.mainHyperliquidBalance")} value={formatCurrency(resultingMainBalance)} />
          <Row label={`${dexFullName} ${t("perpTrade.xyzTradingBalance")}`} value={formatCurrency(resultingXyzBalance)} />
        </div>

        <p className="mt-3 text-[12px] leading-snug text-ink-faint">{t("perpTrade.crossDexExplainer")}</p>

        {amount > 0 && !isValidAmount ? (
          <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{t("perpTrade.transferInsufficientBalance")}</span>
          </div>
        ) : null}

        {result ? <TransferResultBanner result={result} /> : null}

        {!isDone ? (
          <button
            onClick={() => void handleConfirm()}
            disabled={isActive || !isValidAmount}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-60"
          >
            {isActive ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {executionState.stage === "signing" ? t("perpTrade.transferSigning") : t("perpTrade.submitting")}
              </>
            ) : (
              t("perpTrade.confirmAndSign")
            )}
          </button>
        ) : (
          <button
            onClick={handleClose}
            className={cn(
              "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-medium active:opacity-90",
              succeeded ? "bg-ink text-surface" : "bg-surface-2 text-ink"
            )}
          >
            {t("general.close")}
          </button>
        )}
      </div>
    </div>
  );
}
