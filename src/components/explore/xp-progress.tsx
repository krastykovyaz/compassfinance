import { Rocket, Flame } from "lucide-react";
import { DarkCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function XPProgress({
  level,
  levelLabel,
  xp,
  xpToNextLevel,
  streakDays,
}: {
  level: number;
  levelLabel: string;
  xp: number;
  xpToNextLevel: number;
  streakDays: number;
}) {
  const pct = Math.min(100, Math.round((xp / xpToNextLevel) * 100));

  return (
    <DarkCard className="bg-gradient-to-br from-[#1d2130] to-[#14171f]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple/20 text-purple">
            <Rocket size={22} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-dark-ink">
              Level {level} · {levelLabel}
            </p>
            <p className="text-xs text-dark-ink-muted">
              {xp.toLocaleString()} / {xpToNextLevel.toLocaleString()} XP
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-xs font-medium text-orange-400">
          <Flame size={13} />
          {streakDays}
        </span>
      </div>
      <Progress
        value={pct}
        className="mt-4 h-2 bg-dark-card-2"
        indicatorClassName="bg-purple"
      />
    </DarkCard>
  );
}
