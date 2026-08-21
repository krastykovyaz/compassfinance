import { PartyPopper } from "lucide-react";
import { DarkCard } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { formatSignedPercent, cn } from "@/lib/utils";

export function TradeResult({
  pnlPct,
  xpEarned,
  assetName = "The asset",
}: {
  pnlPct: number;
  xpEarned: number;
  assetName?: string;
}) {
  const positive = pnlPct >= 0;

  return (
    <DarkCard className="text-center">
      <div className="flex justify-center">
        <IconCircle colorKey={positive ? "green" : "rose"} size="lg">
          <PartyPopper size={24} />
        </IconCircle>
      </div>
      <h2 className="mt-3 text-[19px] font-semibold text-dark-ink">Nice work!</h2>
      {xpEarned > 0 ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-3 py-1.5 text-sm font-semibold text-orange-400">
          You earned +{xpEarned} XP
        </p>
      ) : null}
      <p
        className={cn(
          "mt-2 text-[15px] font-medium",
          positive ? "text-positive" : "text-negative"
        )}
      >
        Your position {positive ? "gained" : "lost"} {formatSignedPercent(pnlPct)}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-dark-ink-muted">
        {positive
          ? `${assetName} moved higher while you held the position.`
          : `${assetName} moved lower while you held the position — that's a normal part of investing.`}
      </p>
    </DarkCard>
  );
}
