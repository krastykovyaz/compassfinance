"use client";

import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { LessonContent } from "@/lib/learning/content/types";
import { useTranslation } from "@/lib/i18n/locale-provider";

// Same visual language as the original src/components/lesson/lesson-card.tsx
// (used only by the preserved S&P 500 page), extended to also show the new
// content model's objective + key-takeaways bullet list.
export function AssetLessonCard({
  lesson,
  index,
  total,
}: {
  lesson: LessonContent;
  index: number;
  total: number;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="flex items-start gap-3">
        <IconCircle colorKey="purple">
          <BookOpen size={18} />
        </IconCircle>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-muted">
            {t("lesson.lessonLabel")} {index + 1} {t("general.of")} {total}
          </p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-ink">{lesson.title}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{lesson.explanation}</p>
          {lesson.keyTakeaways.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {lesson.keyTakeaways.map((point) => (
                <li key={point} className="flex gap-2 text-[13px] leading-snug text-ink-muted">
                  <span className="text-ink-faint">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
