"use client";

import { Sparkles } from "lucide-react";
import { useCompassUi } from "@/lib/compass/compass-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { CompassContext } from "@/lib/compass/context";

// A small, reusable "Ask Compass about X" CTA (Phase 4, Sections 29/30/32)
// — always opens with an EXPLICIT context override, never the ambient one
// the floating pill would use, so a News page's button always opens
// NEWS·articleId even if the floating pill was last set to something else.
export function AskCompassButton({ context, labelKey }: { context: CompassContext; labelKey: string }) {
  const { open } = useCompassUi();
  const { t } = useTranslation();

  return (
    <button
      onClick={() => open(context)}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-purple/30 bg-purple-50 py-2.5 text-[13px] font-medium text-purple-700 active:opacity-90"
    >
      <Sparkles size={15} />
      {t(labelKey)}
    </button>
  );
}
