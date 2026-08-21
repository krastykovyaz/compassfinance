"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight, CircleDollarSign } from "lucide-react";
import { DarkCard } from "@/components/ui/card";
import { formatCurrency, formatSignedCurrency, formatSignedPercent, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function PortfolioCard({
  value,
  changePct,
  todayPnl,
  buyingPower,
  sparkline,
}: {
  value: number;
  changePct: number;
  todayPnl: number;
  buyingPower: number;
  sparkline: { t: number; v: number }[];
}) {
  const positive = changePct >= 0;
  const { t } = useTranslation();

  return (
    <DarkCard className="overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] text-dark-ink-muted">{t("portfolio.totalPortfolioValue")}</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-dark-ink">
            {formatCurrency(value)}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
                positive ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
              )}
            >
              {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {formatSignedPercent(changePct)} unrealized
            </span>
            <span className="text-xs text-dark-ink-muted">
              {formatSignedCurrency(todayPnl)}
            </span>
          </div>
        </div>
        <div className="h-14 w-24">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#sparkFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-dark-border bg-dark-card-2 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-positive/15 text-positive">
            <CircleDollarSign size={16} />
          </div>
          <div>
            <p className="text-[11px] text-dark-ink-muted">{t("home.buyingPower")}</p>
            <p className="text-sm font-medium text-dark-ink">
              {buyingPower.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC
            </p>
          </div>
        </div>
      </div>
    </DarkCard>
  );
}
