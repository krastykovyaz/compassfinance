import { Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function AchievementUnlock({
  title,
  description,
  xpEarned,
}: {
  title: string;
  description: string;
  xpEarned: number;
}) {
  const { t } = useTranslation();
  return (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-surface text-center">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-500">
          <Trophy size={26} />
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-orange-500">
        {t("learning.achievementUnlocked")}
      </p>
      <h3 className="mt-1 text-[16px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p>
      <p className="mt-2 text-sm font-semibold text-orange-500">
        +{xpEarned} {t("learning.xp")}
      </p>
    </Card>
  );
}
