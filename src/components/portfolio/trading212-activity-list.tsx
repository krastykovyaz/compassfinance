"use client";

import { Landmark } from "lucide-react";
import type { NormalizedActivityItem } from "@/lib/trading212/activity-normalizer";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { formatTrading212CurrencyWithCode } from "@/lib/trading212/currency";

// Requirement 3's worked example is the format target for an execution:
// "BUY / 5 shares × $180.20 / $901.00 / USD". Requirement 5's distinction
// only needs to be VISIBLE when both an order-lifecycle item and an
// execution item exist for the same partially-filled order — a fully
// filled order (the common case) produces just the plain execution line
// with no extra "EXECUTION" noise (see activity-normalizer.ts's own
// dedup rule for exactly when each is emitted).
function describeItem(item: NormalizedActivityItem, t: (key: string) => string): { title: string; subtitle: string; amount: string | null } {
  const currencyFmt = (value: number) => formatTrading212CurrencyWithCode(value, item.currency);

  if (item.kind === "order") {
    const direction = item.direction ?? "";
    const title = `${t("trading212.orderLabel")} · ${direction} ${item.assetName ?? item.rawTicker ?? ""}`.trim();
    const subtitle =
      item.quantity != null
        ? `${t("trading212.requestedLabel")}: ${item.quantity} · ${item.status ?? "—"}`
        : (item.status ?? "—");
    return { title, subtitle, amount: null };
  }

  if (item.kind === "execution") {
    const direction = item.direction ?? "";
    const title = `${direction} ${item.assetName ?? item.rawTicker ?? ""}`.trim();
    const subtitle =
      item.quantity != null && item.price != null
        ? `${item.quantity} ${t("trading212.sharesLabel")} × ${currencyFmt(item.price)}`
        : item.quantity != null
          ? `${item.quantity} ${t("trading212.sharesLabel")}`
          : "";
    return { title, subtitle, amount: item.grossAmount != null ? currencyFmt(item.grossAmount) : null };
  }

  if (item.kind === "dividend") {
    const title = `${t("trading212.dividendLabel")} · ${item.assetName ?? item.rawTicker ?? ""}`.trim();
    return {
      title,
      subtitle: item.quantity != null ? `${item.quantity} ${t("trading212.sharesLabel")}` : "",
      amount: item.grossAmount != null ? `+${currencyFmt(item.grossAmount)}` : null,
    };
  }

  const typeLabel =
    item.kind === "deposit"
      ? t("trading212.depositLabel")
      : item.kind === "withdrawal"
        ? t("trading212.withdrawLabel")
        : item.kind === "fee"
          ? t("trading212.feeLabel")
          : t("trading212.transferLabel");
  // Requirement 8: a transfer-bucketed item still carries the real
  // provider type — surfaced in the subtitle rather than silently
  // dropped, whenever it differs from our own generic label.
  const subtitle = item.rawType && item.rawType !== typeLabel ? item.rawType : "";
  const amount =
    item.grossAmount != null
      ? `${item.direction === "IN" && item.grossAmount >= 0 ? "+" : ""}${currencyFmt(item.grossAmount)}`
      : null;
  return { title: typeLabel, subtitle, amount };
}

export { describeItem };

export function Trading212ActivityList({ items }: { items: NormalizedActivityItem[] }) {
  const { t, locale } = useTranslation();

  if (items.length === 0) {
    return <p className="py-4 text-center text-[13px] text-ink-muted">{t("trading212.noActivity")}</p>;
  }

  return (
    <div className="mt-1 divide-y divide-border">
      {items.map((item) => {
        const { title, subtitle, amount } = describeItem(item, t);
        const date = new Date(item.occurredAt).toLocaleDateString(locale, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        return (
          <div key={item.id} className="flex items-center gap-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
              <Landmark size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">{title}</p>
              <p className="truncate text-[11px] text-ink-muted">{subtitle}</p>
              <p className="text-[11px] text-ink-faint">
                {t("trading212.source")} · {date}
              </p>
            </div>
            <p className="shrink-0 text-[13px] font-medium text-ink">{amount ?? "—"}</p>
          </div>
        );
      })}
    </div>
  );
}
