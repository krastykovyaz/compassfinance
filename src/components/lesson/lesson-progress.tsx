import { Clock, Zap } from "lucide-react";
import { DarkCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function LessonProgress({
  levelLabel,
  xpReward,
  progressPct,
  estimatedMinutes,
}: {
  levelLabel: string;
  xpReward: number;
  progressPct: number;
  estimatedMinutes: number;
}) {
  const { t } = useTranslation();
  return (
    <DarkCard className="bg-gradient-to-br from-[#1d2130] to-[#14171f]">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-purple/20 px-2.5 py-1 text-xs font-medium text-purple">
          {levelLabel}
        </span>
        <div className="flex items-center gap-3 text-xs text-dark-ink-muted">
          <span className="flex items-center gap-1">
            <Zap size={13} className="text-orange-400" />+{xpReward} {t("learning.xp")}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {estimatedMinutes} {t("lesson.min")}
          </span>
        </div>
      </div>
      <Progress
        value={progressPct}
        className="mt-3 h-2 bg-dark-card-2"
        indicatorClassName="bg-purple"
      />
    </DarkCard>
  );
}
