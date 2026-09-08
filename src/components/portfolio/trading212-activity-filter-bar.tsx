"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { Trading212ActivityKindFilter } from "@/server/repositories/trading212-activity-repository";

export type Trading212ActivityFilter = Trading212ActivityKindFilter;

// Requirement 10: exactly the filters the stored/normalized data can
// support reliably — every one of these maps directly onto a real
// activity `kind` the normalizer already produces (see
// activity-normalizer.ts). No "Transfers" chip: TRANSFER-type
// transactions still show up under "All" (via activity-normalizer.ts's
// `rawType` passthrough) but aren't common/distinct enough on their own
// to warrant a dedicated filter per Requirement 10's explicit minimum
// list.
const FILTERS: { value: Trading212ActivityFilter; labelKey: string }[] = [
  { value: "all", labelKey: "trading212.filterAll" },
  { value: "trades", labelKey: "trading212.filterTrades" },
  { value: "orders", labelKey: "trading212.filterOrders" },
  { value: "dividends", labelKey: "trading212.filterDividends" },
  { value: "fees", labelKey: "trading212.filterFees" },
  { value: "deposits", labelKey: "trading212.filterDeposits" },
  { value: "withdrawals", labelKey: "trading212.filterWithdrawals" },
];

export function Trading212ActivityFilterBar({
  value,
  onChange,
  /** Account-level-only filters (deposits/withdrawals) don't apply on
   * the asset-detail page, where every event necessarily belongs to one
   * instrument — hidden there rather than shown-but-always-empty. */
  includeAccountLevel = true,
}: {
  value: Trading212ActivityFilter;
  onChange: (next: Trading212ActivityFilter) => void;
  includeAccountLevel?: boolean;
}) {
  const { t } = useTranslation();
  const filters = includeAccountLevel ? FILTERS : FILTERS.filter((f) => f.value !== "deposits" && f.value !== "withdrawals");

  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {filters.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium",
            value === f.value ? "border-ink bg-ink text-surface" : "border-border text-ink-muted hover:bg-surface-2"
          )}
        >
          {t(f.labelKey)}
        </button>
      ))}
    </div>
  );
}
