"use client";

import Link from "next/link";
import { Lock, LockOpen, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { AssetCatalogEntry } from "@/lib/assets/catalog";
import { InvestmentAccessStatus } from "@/lib/learning/types";
import { LearningAccessStatus } from "@/lib/learning/access";
import { getLessonHref } from "@/lib/learning/routes";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

// Compact card for the horizontally-scrolling Learning Progress sections.
// Width is computed by ScrollableAssetSection's parent container, not
// fixed here — see that file's header comment for the exact
// calc((100% - 1.5rem) / 3) math that makes exactly 3 cards fill the
// visible width, no partial peek.
//
// Status ONLY (Milestone 20 Section 1/3): icon + name + "Learning: X" +
// "Investment: Y", nothing else — no lock-reason/prerequisite text inside
// this card anymore. That explanation now lives on the asset/course entry
// screen instead (see /learn/[assetId]/page.tsx), which is the single
// place a locked stage's "why" and "what unlocks it" is shown. Every
// category (Indices/Stocks/Commodities/Crypto) renders through this same
// component — there is no separate card layout per category.
export function AssetProgressCard({
  asset,
  investmentStatus,
  learningStatus,
  learningLocked,
}: {
  asset: AssetCatalogEntry;
  investmentStatus: InvestmentAccessStatus;
  learningStatus: LearningAccessStatus;
  /** True only when a PRIOR course (not this asset's own lesson) is unfinished — see /learn/[assetId]/page.tsx's identical gate. The card renders non-clickable, with no navigation, when true. */
  learningLocked: boolean;
}) {
  const { t } = useTranslation();
  const href = getLessonHref(asset.id);
  const investmentUnlocked = investmentStatus === "UNLOCKED";

  const learningStatusLabel =
    learningStatus === "COMPLETED"
      ? t("learning.completed")
      : learningStatus === "IN_PROGRESS"
        ? t("learning.inProgress")
        : learningStatus === "NOT_AVAILABLE"
          ? t("learning.notAvailable")
          : t("learning.available");

  const cardBody = (
    <Card
      className={cn(
        "h-full p-2.5",
        investmentUnlocked && "border-positive/30 bg-positive-bg/40",
        learningLocked && "opacity-60"
      )}
    >
      <IconCircle colorKey={investmentUnlocked ? "green" : "slate"} size="sm">
        {investmentUnlocked ? <LockOpen size={14} /> : <Lock size={13} />}
      </IconCircle>
      <p className="mt-2 truncate text-[12px] font-medium text-ink">{asset.name}</p>

      {/* Stacked micro-label + value (rather than one "Label: Value"
          line) so each status reads cleanly at this card's narrow,
          computed width instead of wrapping mid-phrase. */}
      <div className="mt-1.5 space-y-1">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-ink-faint">
            {t("learning.learningLabel")}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-ink-muted">
            {learningStatus === "COMPLETED" ? (
              <CheckCircle2 size={10} className="text-positive" />
            ) : null}
            {learningStatusLabel}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wide text-ink-faint">
            {t("investment.investment")}
          </p>
          <p
            className={cn(
              "text-[11px]",
              investmentUnlocked ? "font-medium text-positive" : "text-ink-muted"
            )}
          >
            {investmentUnlocked ? t("investment.statusAvailable") : t("investment.statusLocked")}
          </p>
        </div>
      </div>
    </Card>
  );

  // Locked-by-a-prior-course cards are deliberately NOT a <Link> at all —
  // no href, no navigation, no hover/pressed interaction to misleadingly
  // suggest the course can be opened. The prerequisite explanation itself
  // lives on the asset/course entry screen, never here (Milestone 25
  // Section 2) — this card communicates status only.
  if (learningLocked) {
    return (
      <div
        className="w-[calc((100%-1.5rem)/3)] shrink-0 snap-start cursor-default"
        aria-disabled="true"
        aria-label={`${asset.name} — ${t("learning.learningLocked")}`}
      >
        {cardBody}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="w-[calc((100%-1.5rem)/3)] shrink-0 snap-start"
      aria-label={`${asset.name} — ${t("learning.learningLabel")}: ${learningStatusLabel}`}
    >
      {cardBody}
    </Link>
  );
}
