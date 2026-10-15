"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Lightbulb, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useCompassUi } from "@/lib/compass/compass-provider";
import {
  getTipForPath,
  readTipPreferences,
  shouldShowTip,
  writeTipPreferences,
  type ScreenTip,
  type TipPreferences,
} from "@/lib/tips/screen-tips";

// Wait a moment after arriving so the bubble does not compete with the screen
// loading in, and so quickly passing through a screen shows nothing.
const SHOW_DELAY_MS = 900;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// A floating hint bubble in the app's dark-card style (same family as the
// achievement toast), sitting above the Compass pill so the two never overlap.
// Shown once per screen, remembered per device, and only to signed-in users -
// the same gate as the Compass button next to it.
export function ScreenTips() {
  const pathname = usePathname();
  const { status } = useSession();
  const { isOpen: compassOpen } = useCompassUi();
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<TipPreferences | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);

  useEffect(() => {
    const load = setTimeout(() => setPrefs(readTipPreferences(browserStorage())), 0);
    return () => clearTimeout(load);
  }, []);

  const tip: ScreenTip | null = status === "authenticated" && prefs ? getTipForPath(pathname) : null;
  const eligible = tip !== null && prefs !== null && shouldShowTip(tip, prefs);
  const tipId = eligible ? tip.id : null;

  useEffect(() => {
    if (!tipId) return;
    const timer = setTimeout(() => setShownFor(tipId), SHOW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setShownFor(null);
    };
  }, [tipId]);

  if (!eligible || !prefs || shownFor !== tip.id || compassOpen) return null;

  function save(next: TipPreferences) {
    setPrefs(next);
    writeTipPreferences(browserStorage(), next);
  }
  const dismiss = () => save({ ...prefs!, dismissed: [...prefs!.dismissed, tip.id] });
  const hideAll = () => save({ ...prefs!, off: true });

  return (
    <div
      role="note"
      className="fixed inset-x-0 z-30 mx-auto w-[calc(100%-32px)] max-w-[388px] animate-[tip-in_240ms_ease-out]"
      // Above the Compass pill (16px over the nav + ~44px tall) with a gap.
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom) + 72px)" }}
    >
      <div className="relative rounded-2xl border border-dark-border bg-dark-card p-3.5 shadow-lg shadow-black/25">
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("tips.close")}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-dark-ink-muted transition-colors active:bg-dark-card-2"
        >
          <X size={15} />
        </button>
        <div className="flex gap-3 pr-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple/20 text-purple">
            <Lightbulb size={17} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-dark-ink">{t(tip.titleKey)}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-dark-ink-muted">{t(tip.bodyKey)}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between pl-12">
          <button type="button" onClick={hideAll} className="text-[12px] font-medium text-dark-ink-muted underline-offset-2 active:underline">
            {t("tips.hideAll")}
          </button>
          <button type="button" onClick={dismiss} className="rounded-full bg-purple px-3.5 py-1.5 text-[12px] font-semibold text-white transition-transform active:scale-95">
            {t("tips.gotIt")}
          </button>
        </div>
      </div>
    </div>
  );
}
