"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { IconCircle } from "@/components/ui/icon-circle";
import { Holding } from "@/lib/mock-data";
import { formatCurrency, formatSignedPercent, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function HoldingsList({ holdings }: { holdings: Holding[] }) {
  const { t } = useTranslation();
  return (
    <div className="divide-y divide-border">
      {holdings.map((h) => {
        const positive = h.changePct >= 0;
        return (
          <Link
            key={h.id}
            href={`/position/${h.slug}`}
            className="flex items-center gap-3 py-3 transition-colors active:bg-surface-2"
          >
            <IconCircle colorKey={h.colorKey}>
              <Building2 size={18} />
            </IconCircle>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">
                {h.name}{" "}
                <span className="font-normal text-ink-muted">({h.symbol})</span>
              </p>
              <p className="text-xs text-ink-muted">{h.shares} {t("portfolio.shares")}</p>
            </div>
            <div className="text-right">
              <p className="text-[14px] font-medium text-ink">
                {formatCurrency(h.value)}
              </p>
              <p
                className={cn(
                  "text-xs font-medium",
                  positive ? "text-positive" : "text-negative"
                )}
              >
                {formatSignedPercent(h.changePct)}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
