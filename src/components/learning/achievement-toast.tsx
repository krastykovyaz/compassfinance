"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { useProgress } from "@/lib/progress-store";
import { useTranslation } from "@/lib/i18n/locale-provider";

const AUTO_DISMISS_MS = 3200;

export function AchievementToast() {
  const { pendingAchievementToast, dismissAchievementToast } = useProgress();
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!pendingAchievementToast) return;
    const showTimer = setTimeout(() => setVisible(true), 0);
    const hideTimer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS - 250);
    const dismissTimer = setTimeout(dismissAchievementToast, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(dismissTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAchievementToast]);

  if (!pendingAchievementToast) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-50 flex justify-center px-5"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-2xl border border-dark-border bg-dark-card px-4 py-3 shadow-lg shadow-black/20 transition-all duration-300 ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-400">
          <Trophy size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-dark-ink-muted">
            {t("learning.achievementUnlocked")}
          </p>
          <p className="truncate text-[14px] font-semibold text-dark-ink">
            {pendingAchievementToast.title}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-purple/20 px-2 py-1 text-[11px] font-semibold text-purple">
          +{pendingAchievementToast.xpReward} {t("learning.xp")}
        </span>
      </div>
    </div>
  );
}
