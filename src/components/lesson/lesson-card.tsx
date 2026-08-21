import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { LessonStep } from "@/lib/lesson-content";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function LessonCard({
  step,
  index,
  total,
}: {
  step: LessonStep;
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
            {t("lesson.stepLabel")} {index + 1} {t("general.of")} {total}
          </p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-ink">{step.title}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{step.body}</p>
        </div>
      </div>
    </Card>
  );
}
