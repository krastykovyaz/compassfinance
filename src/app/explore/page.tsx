"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { XPProgress } from "@/components/explore/xp-progress";
import { LearningTrack } from "@/components/explore/learning-track";
import { AchievementBadge } from "@/components/explore/achievement-badge";
import { UnlockCard } from "@/components/explore/unlock-card";
import { learningTracks } from "@/lib/mock-data";
import { useProgress } from "@/lib/progress-store";
import { sp500LessonSteps, sp500Quiz } from "@/lib/lesson-content";
import { ACHIEVEMENTS } from "@/lib/learning/achievements";
import { useTranslation } from "@/lib/i18n/locale-provider";

// Milestone 9: the "Themes" card that used to live here was the same
// concept as Profile's "Followed themes" / Investor Interests — having
// both was confusing and only one of them (Interests) was ever real,
// user-editable state. Themes was removed; the Profile page's Followed
// themes card is now the single place to view/edit interests (its Edit
// link opens /profile/interests). See interests.ts and
// components/profile/interests-card.tsx.
export default function ExplorePage() {
  const { state, levelInfo, isInvestmentUnlocked, learningProgress } = useProgress();
  const { t } = useTranslation();

  const quizAnsweredCount = Object.keys(state.quizAnswers).length;
  const sp500ProgressPct = Math.round(
    ((state.lessonStepIndex / sp500LessonSteps.length) * 0.5 +
      (quizAnsweredCount / sp500Quiz.length) * 0.5) *
      100
  );

  const dynamicTracks = learningTracks.map((track) =>
    track.id === "indices"
      ? { ...track, progressPct: Math.min(100, sp500ProgressPct) }
      : track
  );

  const nasdaqUnlocked = isInvestmentUnlocked("nasdaq");

  return (
    <AppShell>
      <Header title={t("navigation.explore")} />

      <div className="space-y-5 px-5">
        <XPProgress
          level={levelInfo.level}
          levelLabel={levelInfo.label}
          xp={levelInfo.xp}
          xpToNextLevel={levelInfo.xpToNextLevel}
          streakDays={learningProgress.currentStreak}
        />

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">{t("explore.learningTracks")}</h2>
            <Link
              href="/learn"
              className="flex items-center text-[13px] font-medium text-blue"
            >
              {t("general.seeAll")} <ChevronRight size={14} />
            </Link>
          </div>
          <div className="mt-1 divide-y divide-border">
            {dynamicTracks.map((track, i) => (
              <LearningTrack
                key={track.id}
                track={track}
                index={i}
                href={track.id === "indices" ? "/learn/indices/sp500" : undefined}
              />
            ))}
          </div>
        </Card>

        <div>
          <h2 className="mb-2 px-1 text-[15px] font-semibold text-ink">{t("explore.nextAsset")}</h2>
          <UnlockCard
            assetName="Nasdaq 100"
            assetSlug="nasdaq"
            unlocked={nasdaqUnlocked}
            requirementLabel={t("explore.completeSp500ToUnlock")}
          />
        </div>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">{t("learning.achievements")}</h2>
            <Link href="/learn" className="text-[13px] font-medium text-blue">
              {t("general.seeAll")}
            </Link>
          </div>
          {/* Milestone 9: real, state-driven achievement data (see
              achievements.ts) — this used to render a static mock array
              with hardcoded earned:true values. */}
          <div className="no-scrollbar mt-3 -mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
            {ACHIEVEMENTS.map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                achievement={achievement}
                unlocked={learningProgress.unlockedAchievements.includes(achievement.id)}
              />
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
