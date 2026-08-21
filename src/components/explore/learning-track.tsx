"use client";

import Link from "next/link";
import { Compass, Landmark, LineChart, Shield } from "lucide-react";
import { IconCircle } from "@/components/ui/icon-circle";
import { Progress } from "@/components/ui/progress";
import { LearningTrackItem, ColorKey } from "@/lib/mock-data";
import { useTranslation } from "@/lib/i18n/locale-provider";

const iconMap = {
  compass: Compass,
  landmark: Landmark,
  linechart: LineChart,
  shield: Shield,
};

const colorByIndex: ColorKey[] = ["purple", "blue", "green", "orange"];

export function LearningTrack({
  track,
  index,
  href,
}: {
  track: LearningTrackItem;
  index: number;
  href?: string;
}) {
  const Icon = iconMap[track.icon];
  const colorKey = colorByIndex[index % colorByIndex.length];
  const { t } = useTranslation();

  return (
    <Link
      href={href ?? `/lesson/${track.slug}`}
      className="flex items-center gap-3 rounded-xl py-2.5 transition-colors active:bg-surface-2"
    >
      <IconCircle colorKey={colorKey}>
        <Icon size={18} />
      </IconCircle>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{track.title}</p>
        <p className="text-xs text-ink-muted">{track.moduleCount} {t("explore.modules")}</p>
      </div>
      <div className="w-20 shrink-0">
        <Progress value={track.progressPct} className="h-1.5" />
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-medium text-ink-muted">
        {track.progressPct}%
      </span>
    </Link>
  );
}
