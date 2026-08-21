"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, GraduationCap } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { LearningProgressCard } from "@/components/learning/learning-progress";
import { AchievementCard } from "@/components/learning/achievement-card";
import { AssetProgressCard } from "@/components/learning/asset-progress-card";
import { ScrollableAssetSection } from "@/components/learning/scrollable-asset-section";
import { ScrollableAchievementsList } from "@/components/learning/scrollable-achievements-list";
import { useProgress } from "@/lib/progress-store";
import { ACHIEVEMENTS } from "@/lib/learning/achievements";
import { getNextInvestmentStage } from "@/lib/learning/unlocks";
import { getLessonHref } from "@/lib/learning/routes";
import { getLocalizedUnlockText } from "@/lib/learning/content/localization";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ALL_ASSETS, AssetCategory } from "@/lib/assets/catalog";

// The four asset-class groups (Milestone 18 Section 6) — every one of
// the 13 canonical catalog assets falls into exactly one, so this covers
// the full set that used to be split awkwardly into "gated stages" vs.
// "explore more assets".
const CATEGORY_ORDER: AssetCategory[] = ["index", "stock", "commodity", "crypto"];

export default function LearnPage() {
  const { learningProgress, getInvestmentAccess, getLearningAccess, getBlockingInvestmentStage } =
    useProgress();
  const { t, locale } = useTranslation();

  const nextStage = getNextInvestmentStage(learningProgress);
  const nextStageHref = nextStage ? getLessonHref(nextStage.assetId) : undefined;

  const categoryLabel: Record<AssetCategory, string> = {
    index: t("home.tabIndices"),
    stock: t("home.tabStocks"),
    commodity: t("home.tabCommodities"),
    crypto: t("home.tabCrypto"),
  };

  const assetsWithStatus = ALL_ASSETS.map((asset) => {
    const blocker = getBlockingInvestmentStage(asset.id);
    return {
      asset,
      investmentStatus: getInvestmentAccess(asset.id),
      learningStatus: getLearningAccess(asset.id),
      // Same rule /learn/[assetId]/page.tsx uses to disable Start Course:
      // locked only when a PRIOR course (not this asset's own lesson) is
      // unfinished — never a second calculation, same
      // getBlockingInvestmentStage() both places call.
      learningLocked: blocker !== null && blocker.assetId !== asset.id,
    };
  });

  return (
    <AppShell>
      <Header title={t("learning.learningProgress")} backHref="/profile" />

      <div className="space-y-6 px-5">
        <LearningProgressCard progress={learningProgress} variant="full" />

        <section>
          <h2 className="mb-2 px-1 text-[15px] font-semibold text-ink">
            {t("learning.continueLearningSection")}
          </h2>
          {nextStage ? (
            nextStageHref ? (
              <Link href={nextStageHref} className="block">
                <Card className="transition-colors active:bg-surface-2">
                  <div className="flex items-center gap-3">
                    <IconCircle colorKey="purple" size="lg">
                      <GraduationCap size={22} />
                    </IconCircle>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-ink">{getLocalizedUnlockText(nextStage.assetId, locale)?.name ?? nextStage.name}</p>
                      <p className="text-xs text-ink-muted">
                        &ldquo;{getLocalizedUnlockText(nextStage.assetId, locale)?.topic ?? nextStage.requiredLessonTopic}&rdquo;
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-ink-faint" />
                  </div>
                </Card>
              </Link>
            ) : (
              <Card className="opacity-70">
                <div className="flex items-center gap-3">
                  <IconCircle colorKey="slate" size="lg">
                    <BookOpen size={20} />
                  </IconCircle>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-ink">{getLocalizedUnlockText(nextStage.assetId, locale)?.name ?? nextStage.name}</p>
                    <p className="text-xs text-ink-muted">
                      &ldquo;{getLocalizedUnlockText(nextStage.assetId, locale)?.topic ?? nextStage.requiredLessonTopic}&rdquo; — {t("learning.lessonComingSoon")}
                    </p>
                  </div>
                </div>
              </Card>
            )
          ) : (
            <Card>
              <p className="text-[14px] text-ink-muted">{t("learning.caughtUp")}</p>
            </Card>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[15px] font-semibold text-ink">{t("learning.achievements")}</h2>
            <span className="text-[13px] text-ink-muted">
              {ACHIEVEMENTS.filter((a) => learningProgress.unlockedAchievements.includes(a.id)).length}/{ACHIEVEMENTS.length} {t("learning.unlocked")}
            </span>
          </div>
          <ScrollableAchievementsList>
            {ACHIEVEMENTS.map((a) => (
              <AchievementCard
                key={a.id}
                achievement={a}
                unlocked={learningProgress.unlockedAchievements.includes(a.id)}
              />
            ))}
          </ScrollableAchievementsList>
        </section>

        {CATEGORY_ORDER.map((category) => {
          const inCategory = assetsWithStatus.filter((s) => s.asset.category === category);
          if (inCategory.length === 0) return null;
          return (
            <ScrollableAssetSection key={category} title={categoryLabel[category]}>
              {inCategory.map(({ asset, investmentStatus, learningStatus, learningLocked }) => (
                <AssetProgressCard
                  key={asset.id}
                  asset={asset}
                  investmentStatus={investmentStatus}
                  learningStatus={learningStatus}
                  learningLocked={learningLocked}
                />
              ))}
            </ScrollableAssetSection>
          );
        })}
      </div>
    </AppShell>
  );
}
