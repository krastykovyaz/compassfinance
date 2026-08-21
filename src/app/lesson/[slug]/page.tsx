"use client";

import { use } from "react";
import { Lock, PlayCircle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { IconCircle } from "@/components/ui/icon-circle";
import { learningTracks } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function LessonDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const track = learningTracks.find((t) => t.slug === slug);
  const { t } = useTranslation();

  const title = track?.title ?? t("lesson.lesson");
  const moduleCount = track?.moduleCount ?? 5;
  const progressPct = track?.progressPct ?? 0;
  const completedModules = Math.round((progressPct / 100) * moduleCount);

  return (
    <AppShell>
      <Header title={title} backHref="/explore" />

      <div className="space-y-5 px-5">
        <Card>
          <p className="text-[13px] font-medium text-ink-muted">{t("learning.progress")}</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[19px] font-semibold text-ink">{progressPct}% {t("lesson.percentComplete")}</p>
            <span className="text-[13px] text-ink-muted">
              {completedModules}/{moduleCount} {t("explore.modules")}
            </span>
          </div>
          <Progress value={progressPct} className="mt-3" />
        </Card>

        <Card className="divide-y divide-border p-0 px-4">
          {Array.from({ length: moduleCount }).map((_, i) => {
            const done = i < completedModules;
            const isNext = i === completedModules;
            return (
              <div key={i} className="flex items-center gap-3 py-3.5">
                <IconCircle colorKey={done ? "green" : isNext ? "purple" : "slate"}>
                  {done ? (
                    <CheckCircle2 size={18} />
                  ) : isNext ? (
                    <PlayCircle size={18} />
                  ) : (
                    <Lock size={16} />
                  )}
                </IconCircle>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[14px] font-medium",
                      done || isNext ? "text-ink" : "text-ink-faint"
                    )}
                  >
                    {t("lesson.module")} {i + 1}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {done ? t("learning.completed") : isNext ? t("lesson.upNext") : t("lesson.locked")}
                  </p>
                </div>
              </div>
            );
          })}
        </Card>

        <button
          disabled
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface opacity-90"
        >
          <PlayCircle size={18} />
          {progressPct > 0 ? t("lesson.continueLesson") : t("lesson.startLesson")}
        </button>
      </div>
    </AppShell>
  );
}
