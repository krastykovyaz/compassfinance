"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePriceChartCandles } from "@/lib/market/use-price-chart-candles";
import { CHART_RANGES, ChartRange, MarketSymbol } from "@/lib/market/market-types";
import { cn } from "@/lib/utils";

export function PriceChart({ slug }: { slug: MarketSymbol }) {
  const [range, setRange] = useState<ChartRange>("1D");
  const { candles, status, reason } = usePriceChartCandles(slug, range);

  const series = useMemo(() => candles.map((c) => ({ t: c.t, v: c.c })), [candles]);
  const positive =
    series.length > 0 ? series[series.length - 1].v >= series[0].v : true;

  return (
    <Card>
      <div className="h-[160px] w-full">
        {status === "ok" && series.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="priceChartFill" x1="0" y1="0" x2="0" y2="1">
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
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Area
                type="monotone"
                dataKey="v"
                stroke={positive ? "#16a34a" : "#dc2626"}
                strokeWidth={2.5}
                fill="url(#priceChartFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : status === "loading" ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-24 w-full animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-center">
            <TriangleAlert size={18} className="text-ink-faint" />
            <p className="text-[12px] font-medium text-ink-muted">Market data unavailable</p>
            {reason ? <p className="text-[11px] text-ink-faint">{reason}</p> : null}
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        {CHART_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              r === range
                ? "bg-ink text-surface"
                : "text-ink-muted hover:bg-surface-2"
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </Card>
  );
}
