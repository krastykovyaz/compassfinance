"use client";

import Link from "next/link";
import { GraduationCap, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function ContinueLessonCard({
  slug,
  href,
  title,
  levelLabel,
  progressPct,
}: {
  slug: string;
  href?: string;
  title: string;
  levelLabel: string;
  progressPct: number;
}) {
  const { t } = useTranslation();
  return (
    <Link href={href ?? `/lesson/${slug}`} className="block">
      <Card className="transition-colors active:bg-surface-2">
        <p className="mb-2 text-[13px] font-medium text-ink-muted">
          {t("home.continueYourJourney")}
        </p>
        <div className="flex items-center gap-3">
          <IconCircle colorKey="purple" size="lg">
            <GraduationCap size={22} />
          </IconCircle>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-ink">{title}</p>
            <p className="text-xs text-ink-muted">
              {levelLabel} · {progressPct}%
            </p>
            <Progress value={progressPct} className="mt-2 h-1.5" />
          </div>
          <ChevronRight size={18} className="shrink-0 text-ink-faint" />
        </div>
      </Card>
    </Link>
  );
}
