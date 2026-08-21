"use client";

import Link from "next/link";
import { GraduationCap, ChevronRight } from "lucide-react";
import { DarkCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { IconCircle } from "@/components/ui/icon-circle";
import { LearningProgress } from "@/lib/learning/types";
import { getLevelFromXP, getXPForNextLevel, getLevelProgress } from "@/lib/learning/xp";
import { getInvestmentAccess } from "@/lib/learning/unlocks";
import { ALL_ASSETS } from "@/lib/assets/catalog";
import { ACHIEVEMENTS } from "@/lib/learning/achievements";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function LearningProgressCard({
  progress,
  variant = "compact",
}: {
  progress: LearningProgress;
  variant?: "compact" | "full";
}) {
  const { t } = useTranslation();
  const level = getLevelFromXP(progress.totalXP);
  const xpForNext = getXPForNextLevel(progress.totalXP);
  const pct = getLevelProgress(progress.totalXP);
  // Milestone 22: this used to count completed LESSONS across only the
  // 5-stage ladder — a learning-progress metric mislabeled as an unlock
  // count, and scoped to a fifth of the real catalog. It now counts
  // assets whose INVESTMENT access is actually UNLOCKED (the same
  // getInvestmentAccess() Markets and the asset page already use), across
  // all 13 real catalog assets — so this number can never disagree with
  // what Markets shows for the same assets.
  const unlockedAssetCount = ALL_ASSETS.filter(
    (a) => getInvestmentAccess(a.id, progress) === "UNLOCKED"
  ).length;

  const body = (
    <>
      <div className="flex items-center gap-3">
        <IconCircle colorKey="purple" size={variant === "full" ? "lg" : "md"}>
          <GraduationCap size={variant === "full" ? 22 : 18} />
        </IconCircle>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-dark-ink">
            {t("learning.level")} {level.level} · {level.label}
          </p>
          <p className="text-xs text-dark-ink-muted">
            {progress.totalXP.toLocaleString()} / {xpForNext.toLocaleString()} {t("learning.xp")}
          </p>
        </div>
        {variant === "compact" ? (
          <ChevronRight size={18} className="shrink-0 text-dark-ink-muted" />
        ) : null}
      </div>
      <Progress
        value={pct}
        className="mt-3 h-2 bg-dark-card-2"
        indicatorClassName="bg-purple"
      />
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <StatCell label={t("learning.lessons")} value={progress.lessonsCompleted} />
        <StatCell
          label={t("learning.achievements")}
          value={ACHIEVEMENTS.filter((achievement) => progress.unlockedAchievements.includes(achievement.id)).length}
        />
        <StatCell
          label={t("learning.assets")}
          value={`${unlockedAssetCount}/${ALL_ASSETS.length}`}
        />
      </div>
    </>
  );

  if (variant === "full") {
    return <DarkCard className="bg-gradient-to-br from-[#1d2130] to-[#14171f]">{body}</DarkCard>;
  }

  return (
    <Link href="/learn" className="block">
      <DarkCard className="bg-gradient-to-br from-[#1d2130] to-[#14171f] transition-opacity active:opacity-90">
        {body}
      </DarkCard>
    </Link>
  );
}

function StatCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-dark-card-2 py-2">
      <p className="text-[15px] font-semibold text-dark-ink">{value}</p>
      <p className="text-[10px] text-dark-ink-muted">{label}</p>
    </div>
  );
}
