"use client";

import { useState } from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function TradeSheet({
  assetName,
  entryPrice,
  maxAmountUsdc,
  onConfirm,
  onClose,
  onViewPosition,
}: {
  assetName: string;
  entryPrice: number;
  /** The account's current cash balance — caps what can be entered, shown as a hint. */
  maxAmountUsdc: number;
  /** Executes the BUY for this USDC amount against the real trading service. */
  onConfirm: (amountUsdc: number) => Promise<{ status: "ok" } | { status: "error"; reason: string }>;
  onClose: () => void;
  onViewPosition: () => void;
}) {
  const [amountUsdc, setAmountUsdc] = useState(Math.min(10, maxAmountUsdc));
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const estimatedUnits = amountUsdc > 0 ? amountUsdc / entryPrice : 0;
  const canBuy = amountUsdc > 0 && amountUsdc <= maxAmountUsdc && !submitting;

  async function handleBuy() {
    if (!canBuy) return;
    setSubmitting(true);
    setError(null);
    const result = await onConfirm(amountUsdc);
    setSubmitting(false);
    if (result.status === "ok") {
      setConfirmed(true);
    } else {
      setError(result.reason);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-[420px] rounded-t-[28px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-2" />

        {!confirmed ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-ink">
                {t("trade.practiceBuying")} {assetName}
              </h2>
              <button
                aria-label="Close"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-surface-2 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-muted">{t("trade.amount")}</p>
                <p className="text-xs text-ink-faint">
                  {formatCurrency(maxAmountUsdc)} available
                </p>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={maxAmountUsdc}
                  step="0.01"
                  value={amountUsdc}
                  onChange={(e) => setAmountUsdc(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-transparent text-[24px] font-semibold text-ink outline-none"
                  aria-label="Amount in USDC"
                />
                <span className="text-[15px] font-medium text-ink-muted">USDC</span>
              </div>
            </div>

            <div className="mt-3 space-y-2.5 rounded-2xl border border-border p-4">
              <Row
                label={t("trade.estimatedPosition")}
                value={`${formatNumber(estimatedUnits, 4)} ${t("trade.units")}`}
              />
              <Row label={t("trade.entryPrice")} value={formatNumber(entryPrice)} />
              <Row label={t("trade.potentialPnl")} value={t("trade.simulatedPracticeOnly")} muted />
            </div>

            {error ? (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-negative/10 px-3 py-2 text-[13px] font-medium text-negative">
                <AlertCircle size={14} />
                {error}
              </div>
            ) : (
              <p className="mt-3 text-center text-xs text-ink-faint">
                {t("trade.simulatedDisclaimer")}
              </p>
            )}

            <button
              onClick={handleBuy}
              disabled={!canBuy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Placing order…" : `${t("trade.buyFor")} ${formatCurrency(amountUsdc)}`}
            </button>
          </>
        ) : (
          <div className="py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-positive-bg text-positive">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="mt-3 text-[17px] font-semibold text-ink">{t("trade.positionOpened")}</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {formatCurrency(amountUsdc)} in {assetName} at {formatNumber(entryPrice)}
            </p>
            <button
              onClick={onViewPosition}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
            >
              {t("trade.viewPosition")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className={muted ? "text-[13px] text-ink-faint" : "text-[13px] font-medium text-ink"}>
        {value}
      </span>
    </div>
  );
}
