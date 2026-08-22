"use client";

// Confirmation step for Hyperliquid Trading — the Phase 3 read-only
// preview, extended in Phase 4 with a real "Confirm & Sign" action. This
// component itself never signs or submits anything: it renders whatever
// stage the caller (the trading page, which owns the actual
// signAndSubmitPerpOrder() call) reports via `executionState`, and calls
// `onConfirmAndSign` when the user taps the button — a plain callback, no
// wallet/fetch access here.

import { X, Loader2, TriangleAlert, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { PerpOrderPreview } from "@/lib/hyperliquid/perp-order-calculator";
import type { PerpOrderExecutionResult, PerpOrderExecutionStage } from "@/lib/hyperliquid/hyperliquid-order-signer";

export type PerpOrderExecutionUiState =
  | { stage: "idle" }
  | { stage: PerpOrderExecutionStage }
  | { stage: "done"; result: PerpOrderExecutionResult };

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className={muted ? "text-[13px] text-ink-faint" : "text-[13px] font-medium text-ink"}>{value}</span>
    </div>
  );
}

export function PerpOrderPreviewSheet({
  coin,
  preview,
  executionState,
  onConfirmAndSign,
  onClose,
}: {
  coin: string;
  preview: PerpOrderPreview;
  executionState: PerpOrderExecutionUiState;
  onConfirmAndSign: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const positive = preview.side === "long";
  const isActive = executionState.stage !== "idle" && executionState.stage !== "done";
  const isDone = executionState.stage === "done";
  const result = isDone ? executionState.result : null;

  function handleClose() {
    if (isActive) return; // don't allow closing mid-signature/submission
    onClose();
  }

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
          <h2 className="text-[17px] font-semibold text-ink">{t("perpTrade.orderPreviewTitle")}</h2>
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

        <div className="mt-4 flex items-center gap-2">
          <span
            className={
              positive
                ? "rounded-full bg-positive-bg px-2.5 py-1 text-[13px] font-semibold text-positive"
                : "rounded-full bg-negative-bg px-2.5 py-1 text-[13px] font-semibold text-negative"
            }
          >
            {positive ? t("perpTrade.long") : t("perpTrade.short")}
          </span>
          <span className="text-[15px] font-semibold text-ink">{coin}-PERP</span>
        </div>

        <div className="mt-4 space-y-2.5 rounded-2xl border border-border p-4">
          <Row label={t("perpTrade.margin")} value={formatCurrency(preview.marginUsdc)} />
          <Row label={t("perpTrade.leverage")} value={`${preview.leverage}x`} />
          <Row label={t("perpTrade.positionSize")} value={formatCurrency(preview.notionalValue)} />
          <Row label={t("perpTrade.estimatedUnits")} value={`${formatNumber(preview.estimatedUnits, 5)} ${coin}`} />
          <Row label={t("perpTrade.entryPrice")} value={formatCurrency(preview.entryPrice)} />
          <Row
            label={t("perpTrade.estimatedLiquidationPrice")}
            value={preview.liquidationPrice !== null ? formatCurrency(preview.liquidationPrice) : "—"}
          />
          <Row label={t("perpTrade.estimatedFee")} value={formatCurrency(preview.estimatedFee)} muted />
        </div>

        {!isDone ? (
          <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2.5 text-xs text-negative">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{t("perpTrade.realMoneyWarning")}</span>
          </div>
        ) : null}

        {result ? <ResultBanner result={result} /> : null}

        {!isDone ? (
          <button
            onClick={onConfirmAndSign}
            disabled={isActive}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-60"
          >
            {isActive ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {stageLabel(executionState.stage, t)}
              </>
            ) : (
              t("perpTrade.confirmAndSign")
            )}
          </button>
        ) : (
          <button
            onClick={onClose}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
          >
            {t("general.close")}
          </button>
        )}
      </div>
    </div>
  );
}

function stageLabel(stage: PerpOrderExecutionStage, t: (key: string) => string): string {
  switch (stage) {
    case "signing-leverage":
      return t("perpTrade.signingLeverage");
    case "submitting-leverage":
      return t("perpTrade.submitting");
    case "signing-order":
      return t("perpTrade.signingOrder");
    case "submitting-order":
      return t("perpTrade.submitting");
  }
}

function ResultBanner({ result }: { result: PerpOrderExecutionResult }) {
  const { t } = useTranslation();

  if (result.status === "wallet-rejected") {
    return (
      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-ink-muted">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
        <span>{t("perpTrade.walletRejected")}</span>
      </div>
    );
  }
  if (result.status === "filled") {
    return (
      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-positive-bg px-3 py-2.5 text-xs text-positive">
        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
        <span>
          {t("perpTrade.orderFilled")} — {formatNumber(result.totalSize, 5)} @ {formatCurrency(result.avgPrice)}
        </span>
      </div>
    );
  }
  if (result.status === "resting" || result.status === "pending") {
    return (
      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-positive-bg px-3 py-2.5 text-xs text-positive">
        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
        <span>{t("perpTrade.orderSubmitted")}</span>
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
  // "rejected" (our own pre-flight check) or "hyperliquid-rejected".
  return (
    <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2.5 text-xs text-negative">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <span>{result.message}</span>
    </div>
  );
}

// Re-exported so the trading page (the actual owner of the execution
// state machine) shares the exact same type without a second definition.
export type { PerpOrderExecutionStage };
