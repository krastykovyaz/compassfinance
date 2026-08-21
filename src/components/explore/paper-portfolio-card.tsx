"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatSignedPercent } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { usePerformanceHistory } from "@/lib/trading/paper-account-provider";

// Shows the real paper-trading account — same PaperAccountProvider/
// usePerformanceHistory() Home and Portfolio use, not a separate number.
export function PaperPortfolioCard({
  value,
  changePct,
  label,
}: {
  value: number;
  changePct: number;
  label: string;
}) {
  const { t } = useTranslation();
  const { points } = usePerformanceHistory("1D");
  const positive = changePct >= 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-ink-muted">{t("explore.paperPortfolio")}</p>
          <p className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
            {formatCurrency(value)}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className={
                positive
                  ? "text-xs font-medium text-positive"
                  : "text-xs font-medium text-negative"
              }
            >
              {formatSignedPercent(changePct)}
            </span>
            <Badge colorKey="purple">{label}</Badge>
          </div>
        </div>
        {points.length >= 2 ? (
          <div className="h-12 w-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="paperFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={positive ? "#16a34a" : "#dc2626"}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={positive ? "#16a34a" : "#dc2626"}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={positive ? "#16a34a" : "#dc2626"}
                  strokeWidth={2}
                  fill="url(#paperFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
