import { PartyPopper } from "lucide-react";
import { DarkCard } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function QuizResult({
  correctCount,
  totalCount,
  xpEarned,
}: {
  correctCount: number;
  totalCount: number;
  xpEarned: number;
}) {
  const { t } = useTranslation();
  return (
    <DarkCard className="text-center">
      <div className="flex justify-center">
        <IconCircle colorKey="orange" size="lg">
          <PartyPopper size={24} />
        </IconCircle>
      </div>
      <h2 className="mt-3 text-[19px] font-semibold text-dark-ink">{t("lesson.quizComplete")}</h2>
      <p className="mt-1 text-[14px] text-dark-ink-muted">
        {t("lesson.youGot")} {correctCount} {t("general.of")} {totalCount} {t("lesson.correctSuffix")}
      </p>
      <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-3 py-1.5 text-sm font-semibold text-orange-400">
        +{xpEarned} {t("lesson.xpEarned")}
      </p>
    </DarkCard>
  );
}
