"use client";

// Close/Reduce Position — a single reduce-only market order against an
// existing Hyperliquid position. Side is NEVER editable (always derived
// from the real position — see closingOrderParamsForPosition in
// hyperliquid-order-signer.ts): only the amount to close is, capped at
// the position's own full size, so this same flow covers both a partial
// reduce (amount < full size) and a full close (amount = full size) —
// one action, not two. Always a market order at Reduce Only. Reuses
// ResultBanner from perp-order-preview-sheet.tsx so a fill/reject/
// wallet-rejection reads identically to opening a position.

import { TriangleAlert, X, Loader2 } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ResultBanner, PartialFillBanner } from "./perp-order-preview-sheet";
import type { HyperliquidPosition } from "@/lib/hyperliquid/hyperliquid-types";
import { checkPartialFill, type PerpOrderExecutionResult } from "@/lib/hyperliquid/hyperliquid-order-signer";

export type CloseExecutionUiState =
  | { stage: "idle" }
  | { stage: "signing" | "submitting" }
  // requestedSize travels with the result purely for display — comparing
  // it against a "filled" result's own totalSize (via checkPartialFill)
  // is what detects a partial fill below. Never touches the signing/
  // submission/reduceOnly logic, which already ran by the time this
  // state is reached.
  | { stage: "done"; result: PerpOrderExecutionResult; requestedSize: number };

const CLOSE_PRESET_FRACTIONS = [0.25, 0.5, 0.75, 1];

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
  sizeInput,
  onSizeInputChange,
  agentReady,
  executionState,
  onConfirm,
  onClose,
}: {
  position: HyperliquidPosition;
  /** Controlled amount-to-close, in the position's own coin units — a
   * plain string so the number input can hold an in-progress value
   * (e.g. "0.001" mid-typing) without fighting number parsing. Never
   * pre-derived beyond "starts equal to the full position size". */
  sizeInput: string;
  onSizeInputChange: (value: string) => void;
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
  const requestedSize = isDone ? executionState.requestedSize : 0;
  const maxSize = Math.abs(position.size);
  const parsedSize = Number(sizeInput) || 0;
  const isValidSize = parsedSize > 0 && parsedSize <= maxSize;

  // checkPartialFill returns null for every status except "filled" —
  // every other status (wallet-rejected, resting, rejected,
  // hyperliquid-rejected, network-failure) is untouched and still
  // rendered by the shared ResultBanner exactly as before.
  const partialFill = result ? checkPartialFill(result, requestedSize, maxSize) : null;

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
          <h2 className="text-[17px] font-semibold text-ink">{t("hyperliquidAccount.managePositionTitle")}</h2>
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

        <div className="mt-4 rounded-2xl bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-muted">{t("hyperliquidAccount.closePositionSize")}</p>
            <p className="text-[13px] text-ink-muted">
              {t("hyperliquidAccount.closePositionMax")}: {formatNumber(maxSize, 5)} {position.coin}
            </p>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <input
              type="number"
              min={0}
              max={maxSize}
              step="any"
              value={sizeInput}
              onChange={(e) => onSizeInputChange(e.target.value)}
              disabled={isActive || isDone}
              placeholder="0"
              className="w-full bg-transparent text-[24px] font-semibold text-ink outline-none disabled:opacity-60"
              aria-label={t("hyperliquidAccount.closePositionSize")}
            />
            <span className="shrink-0 text-[15px] font-medium text-ink-muted">{position.coin}</span>
          </div>
          <input
            type="range"
            min={0}
            max={maxSize}
            step={maxSize > 0 ? maxSize / 1000 : 1}
            value={Math.min(parsedSize, maxSize)}
            onChange={(e) => onSizeInputChange(e.target.value)}
            disabled={isActive || isDone}
            className="mt-2 w-full accent-ink disabled:opacity-60"
          />
          <div className="mt-2 flex gap-1.5">
            {CLOSE_PRESET_FRACTIONS.map((fraction) => (
              <button
                key={fraction}
                type="button"
                onClick={() => onSizeInputChange((maxSize * fraction).toString())}
                disabled={isActive || isDone}
                className="flex-1 rounded-full bg-surface px-2 py-1.5 text-[12px] font-medium text-ink-muted active:opacity-80 disabled:opacity-60"
              >
                {fraction === 1 ? t("perpTrade.maxLeverageLabel") : `${fraction * 100}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-2.5 rounded-2xl border border-border p-4">
          <Row
            label={t("hyperliquidAccount.closePositionRemaining")}
            value={`${formatNumber(Math.max(maxSize - Math.min(parsedSize, maxSize), 0), 5)} ${position.coin}`}
          />
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

        {partialFill?.isPartial ? (
          <PartialFillBanner
            coin={position.coin}
            requestedSize={requestedSize}
            filledSize={partialFill.filledSize}
            remainingSize={partialFill.remainingSize}
            noticeKey="hyperliquidAccount.closePositionPartialFillNotice"
          />
        ) : result ? (
          <ResultBanner result={result} />
        ) : null}

        {!isDone ? (
          <button
            onClick={onConfirm}
            disabled={isActive || !agentReady || !isValidSize}
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
