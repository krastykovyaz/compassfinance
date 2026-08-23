"use client";

// Close Position — a single reduce-only market order sized to exactly
// close an existing Hyperliquid position. Deliberately minimal: the user
// never edits size or side (both are derived from the real position,
// see closingOrderParamsForPosition in hyperliquid-order-signer.ts), and
// this is always a market order at Reduce Only — nothing else to choose.
// Reuses ResultBanner from perp-order-preview-sheet.tsx so a fill/reject/
// wallet-rejection reads identically to opening a position.

import { X, Loader2, TriangleAlert } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ResultBanner } from "./perp-order-preview-sheet";
import type { HyperliquidPosition } from "@/lib/hyperliquid/hyperliquid-types";
import type { PerpOrderExecutionResult } from "@/lib/hyperliquid/hyperliquid-order-signer";

export type CloseExecutionUiState =
  | { stage: "idle" }
  | { stage: "signing" | "submitting" }
  | { stage: "done"; result: PerpOrderExecutionResult };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[13px] font-medium text-ink">{value}</span>
    </div>
  );
}

export function ClosePositionModal({
  position,
  agentReady,
  executionState,
  onConfirm,
  onClose,
}: {
  position: HyperliquidPosition;
  /** False when no agent has been approved yet (see
   * hyperliquid-agent-provider.tsx) — closing still needs a real
   * signature, same as opening does. */
  agentReady: boolean;
  executionState: CloseExecutionUiState;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isLong = position.size >= 0;
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
          <h2 className="text-[17px] font-semibold text-ink">{t("hyperliquidAccount.closePositionTitle")}</h2>
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
              isLong
                ? "rounded-full bg-positive-bg px-2.5 py-1 text-[13px] font-semibold text-positive"
                : "rounded-full bg-negative-bg px-2.5 py-1 text-[13px] font-semibold text-negative"
            }
          >
            {isLong ? t("perpTrade.long") : t("perpTrade.short")}
          </span>
          <span className="text-[15px] font-semibold text-ink">{position.coin}-PERP</span>
        </div>

        <div className="mt-4 space-y-2.5 rounded-2xl border border-border p-4">
          <Row label={t("hyperliquidAccount.closePositionSize")} value={`${formatNumber(Math.abs(position.size), 5)} ${position.coin}`} />
          <Row label={t("hyperliquidAccount.closePositionType")} value={t("hyperliquidAccount.closePositionMarket")} />
          <Row label={t("hyperliquidAccount.closePositionReduceOnly")} value={t("general.yes")} />
          <Row label={t("hyperliquidAccount.entryPrice")} value={position.entryPrice !== null ? formatCurrency(position.entryPrice) : "—"} />
        </div>

        {!agentReady && !isDone ? (
          <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2.5 text-xs text-negative">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{t("hyperliquidAccount.closePositionApproveFirst")}</span>
          </div>
        ) : null}

        {result ? <ResultBanner result={result} /> : null}

        {!isDone ? (
          <button
            onClick={onConfirm}
            disabled={isActive || !agentReady}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-60"
          >
            {isActive ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {executionState.stage === "signing"
                  ? t("hyperliquidAccount.closePositionSigning")
                  : t("perpTrade.submitting")}
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
