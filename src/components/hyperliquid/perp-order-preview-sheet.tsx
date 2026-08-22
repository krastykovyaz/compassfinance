"use client";

// Confirmation step for the Hyperliquid Trading Phase 3 order-preview
// flow. Visually mirrors src/components/asset/trade-sheet.tsx's bottom
// sheet for consistency, but there is deliberately no "confirm"/"submit"
// action anywhere in this file — the only button is a close/done action.
// This phase never submits a real order: no fetch, no wallet signature
// request, no Hyperliquid "exchange" (write) endpoint reference.

import { X, Info } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { PerpOrderPreview } from "@/lib/hyperliquid/perp-order-calculator";

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
  onClose,
}: {
  coin: string;
  preview: PerpOrderPreview;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const positive = preview.side === "long";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label={t("general.close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-[420px] rounded-t-[28px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-2" />

        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">{t("perpTrade.orderPreviewTitle")}</h2>
          <button
            aria-label={t("general.close")}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
          >
            <X size={18} />
          </button>
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

        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-ink-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>{t("perpTrade.previewOnlyDisclaimer")}</span>
        </div>

        <button
          onClick={onClose}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
        >
          {t("general.close")}
        </button>
      </div>
    </div>
  );
}
