"use client";

import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { DarkCard } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatSignedCurrency, formatSignedPercent, cn } from "@/lib/utils";

export function PositionCard({
  assetName,
  entryPrice,
  currentPrice,
  amountUsdc,
  series,
}: {
  assetName: string;
  entryPrice: number;
  currentPrice: number;
  amountUsdc: number;
  series: { t: number; v: number }[];
}) {
  const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  const pnlUsdc = amountUsdc * (pnlPct / 100);
  const positionValue = amountUsdc + pnlUsdc;
  const positive = pnlPct >= 0;

  return (
    <DarkCard>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] text-dark-ink-muted">{assetName} · Practice position</p>
          <p className="mt-1 text-[26px] font-semibold tracking-tight text-dark-ink">
            {formatCurrency(positionValue)}
          </p>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              positive ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
            )}
          >
            {formatSignedPercent(pnlPct)} · {formatSignedCurrency(pnlUsdc)}
          </span>
        </div>
      </div>

      <div className="mt-3 h-[110px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="positionFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={positive ? "#22c55e" : "#ef4444"}
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor={positive ? "#22c55e" : "#ef4444"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Area
              type="monotone"
              dataKey="v"
              stroke={positive ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              fill="url(#positionFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border border-dark-border bg-dark-card-2 p-3.5">
        <div>
          <p className="text-[11px] text-dark-ink-muted">Entry price</p>
          <p className="text-sm font-medium text-dark-ink">{formatNumber(entryPrice)}</p>
        </div>
        <div>
          <p className="text-[11px] text-dark-ink-muted">Current price</p>
          <p className="text-sm font-medium text-dark-ink">{formatNumber(currentPrice)}</p>
        </div>
      </div>
    </DarkCard>
  );
}
