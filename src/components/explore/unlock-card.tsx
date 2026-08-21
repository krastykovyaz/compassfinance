"use client";

import Link from "next/link";
import { Lock, LockOpen, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { getLessonHref } from "@/lib/learning/routes";
import { useTranslation } from "@/lib/i18n/locale-provider";

/**
 * Milestone 8.1: always clickable, regardless of investment status — a
 * locked investment doesn't mean the asset can't be learned about. Locked
 * routes to the lesson (learning is always available); unlocked routes to
 * the investable asset page.
 */
export function UnlockCard({
  assetName,
  assetSlug,
  unlocked,
  requirementLabel,
}: {
  assetName: string;
  assetSlug: string;
  unlocked: boolean;
  requirementLabel: string;
}) {
  const href = unlocked ? `/asset/${assetSlug}` : getLessonHref(assetSlug);
  const { t } = useTranslation();

  return (
    <Link href={href} className="block">
      <Card
        className={
          unlocked
            ? "border-positive/30 bg-positive-bg/40 transition-colors active:bg-positive-bg/60"
            : "transition-colors active:bg-surface-2"
        }
      >
        <div className="flex items-center gap-3">
          <IconCircle colorKey={unlocked ? "green" : "slate"}>
            {unlocked ? <LockOpen size={18} /> : <Lock size={16} />}
          </IconCircle>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">{assetName}</p>
            <p className="text-xs text-ink-muted">
              {t("investment.investment")}: {unlocked ? `${t("journey.unlocked")}!` : requirementLabel}
            </p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-ink-faint" />
        </div>
      </Card>
    </Link>
  );
}
