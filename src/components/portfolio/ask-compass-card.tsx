"use client";

import { useState } from "react";
import { Sparkles, ChevronRight, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { useTranslation } from "@/lib/i18n/locale-provider";

// A clear, honest entry point — deliberately NOT wired to a live
// portfolio-analysis backend yet (this phase's brief was the Paper/Real
// separation, not a new AI feature). What it DOES do is real: it states,
// per source, whether that source is simulated or real money, so tapping
// it never implies Paper Trading positions are anything but a practice
// account. Each line names its own source explicitly, matching the
// "identify the source/account being analyzed" requirement without
// fetching anything new or fabricating an "insight."
export function AskCompassCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card>
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 text-left">
          <IconCircle colorKey="purple">
            <Sparkles size={18} />
          </IconCircle>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
              {t("portfolio.askCompassTitle")}
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600">
                {t("portfolio.askCompassBadge")}
              </span>
            </p>
            <p className="text-xs text-ink-muted">{t("portfolio.askCompassDescription")}</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-ink-faint" />
        </button>
      </Card>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            aria-label={t("general.close")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          />
          <div className="relative w-full max-w-[420px] rounded-t-[28px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-2" />
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-ink">{t("portfolio.askCompassTitle")}</h2>
              <button
                aria-label={t("general.close")}
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 space-y-2.5">
              <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
                {t("portfolio.askCompassPaperInsight")}
              </p>
              <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
                {t("portfolio.askCompassTrading212Insight")}
              </p>
              <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
                {t("portfolio.askCompassHyperliquidInsight")}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
