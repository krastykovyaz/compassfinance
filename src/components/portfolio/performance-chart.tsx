"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { PERFORMANCE_RANGES, PerformanceRange } from "@/lib/trading/types";
import { usePerformanceHistory } from "@/lib/trading/paper-account-provider";
import { cn } from "@/lib/utils";

// The single performance-history chart Home and Portfolio both render
// (Milestone 17) — real recorded portfolio-value snapshots plus the
// current live value, fetched via usePerformanceHistory(). No mock
// sine-wave series anywhere in here anymore.
export function PerformanceChart() {
  const [range, setRange] = useState<PerformanceRange>("1D");
  const { points, isLoading, error } = usePerformanceHistory(range);

  const first = points[0]?.v;
  const last = points[points.length - 1]?.v;
  const positive = first == null || last == null ? true : last >= first;
  const hasEnoughHistory = points.length >= 2;

  // A tight ["dataMin", "dataMax"] domain stretches even a trivial move
  // (a few cents on a $1,000+ balance) to fill the entire chart height,
  // reading as a dramatic crash/rally when nothing meaningful happened.
  // Pad generously relative to the real spread, with a value-relative
  // floor so a perfectly flat line still renders as a flat line
  // mid-chart instead of a degenerate zero-height domain.
  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (points.length === 0) return undefined;
    const values = points.map((p) => p.v);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const span = dataMax - dataMin;
    const padding = Math.max(span * 1.5, dataMax * 0.002);
    return [dataMin - padding, dataMax + padding];
  }, [points]);

  return (
    <div>
      <div className="h-[180px] w-full">
        {isLoading && points.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-24 w-full animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : error ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-[12px] text-ink-faint">Couldn&apos;t load performance history.</p>
          </div>
        ) : hasEnoughHistory ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
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
              {/* Snapshots are recorded opportunistically (throttled, not on a
                  fixed interval), so a quiet overnight stretch can have far
                  fewer points than an active one covering less real time.
                  Without a real time-based x-axis, index-based spacing
                  compresses sparse periods and stretches dense ones,
                  distorting flat/near-flat history into a misleading spike. */}
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis domain={yDomain ?? ["dataMin", "dataMax"]} hide />
              <Area
                type="monotone"
                dataKey="v"
                stroke={positive ? "#16a34a" : "#dc2626"}
                strokeWidth={2.5}
                fill="url(#perfFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center">
            <p className="max-w-[220px] text-[12px] text-ink-faint">
              Not enough history yet — keep using your paper account and a trend will build up
              here.
            </p>
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        {PERFORMANCE_RANGES.map((r) => (
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
    </div>
  );
}
