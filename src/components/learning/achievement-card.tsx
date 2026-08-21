import {
  Footprints,
  HelpCircle,
  TrendingUp,
  Landmark,
  LineChart,
  Building2,
  Layers,
  Flame,
  Lock,
  Share2,
  Check,
  LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { AchievementDefinition, AchievementIconName } from "@/lib/learning/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { getLocalizedAchievementText } from "@/lib/learning/content/localization";
import { useAchievementShare } from "@/lib/share/use-achievement-share";

const ICONS: Record<AchievementIconName, LucideIcon> = {
  footprints: Footprints,
  "help-circle": HelpCircle,
  "trending-up": TrendingUp,
  landmark: Landmark,
  "line-chart": LineChart,
  "building-2": Building2,
  layers: Layers,
  flame: Flame,
};

export function AchievementCard({
  achievement,
  unlocked,
}: {
  achievement: AchievementDefinition;
  unlocked: boolean;
}) {
  const Icon = unlocked ? ICONS[achievement.icon] : Lock;
  const { t, locale } = useTranslation();
  const localized = getLocalizedAchievementText(achievement.id, locale);
  const { share, sharing, shared, isSignedIn } = useAchievementShare();

  const title = localized?.title ?? achievement.title;

  function handleShare() {
    const message = `${t("achievementShare.achievementMessagePrefix")} "${title}" ${t(
      "achievementShare.achievementMessageSuffix"
    )}`;
    share("achievement", achievement.id, message);
  }

  return (
    <Card className={cn("flex items-start gap-3", !unlocked && "opacity-60")}>
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
          unlocked ? "bg-purple-50 text-purple-600" : "bg-surface-2 text-ink-faint"
        )}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">
          {localized?.description ?? achievement.description}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-ink-faint">
            +{achievement.xpReward} {t("learning.xp")}
          </p>
          {unlocked && isSignedIn ? (
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink active:opacity-80 disabled:opacity-50"
            >
              {shared ? <Check size={12} className="text-positive" /> : <Share2 size={12} />}
              {shared ? t("achievementShare.shared") : t("achievementShare.cta")}
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
