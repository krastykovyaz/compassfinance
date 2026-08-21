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
  LucideIcon,
} from "lucide-react";
import { AchievementDefinition, AchievementIconName } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

// Milestone 9: this now renders the SAME real, state-driven achievement
// data as the /learn page's AchievementCard (src/lib/learning/achievements.ts)
// instead of the static mock Achievement[] that used to live in
// mock-data.ts — that array was demo UI with hardcoded `earned: true`
// values that never changed regardless of what the user actually did.
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

const COLOR_BY_ICON: Record<AchievementIconName, string> = {
  footprints: "bg-purple-50 text-purple-600",
  "help-circle": "bg-blue-50 text-blue-600",
  "trending-up": "bg-green-50 text-green-600",
  landmark: "bg-orange-50 text-orange-600",
  "line-chart": "bg-teal-50 text-teal-600",
  "building-2": "bg-slate-100 text-slate-600",
  layers: "bg-rose-50 text-rose-600",
  flame: "bg-orange-50 text-orange-600",
};

export function AchievementBadge({
  achievement,
  unlocked,
}: {
  achievement: AchievementDefinition;
  unlocked: boolean;
}) {
  const Icon = unlocked ? ICONS[achievement.icon] : Lock;

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl",
          unlocked ? COLOR_BY_ICON[achievement.icon] : "bg-surface-2 text-ink-faint"
        )}
      >
        <Icon size={20} />
      </div>
      <span
        className={cn(
          "text-[11px] font-medium leading-tight",
          unlocked ? "text-ink-muted" : "text-ink-faint"
        )}
      >
        {achievement.title}
      </span>
    </div>
  );
}
