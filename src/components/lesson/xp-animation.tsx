"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function XpAnimation({ amount, trigger }: { amount: number; trigger: number }) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (trigger === 0) return;
    // Deferred via setTimeout(0) so this isn't a *synchronous* setState call
    // within the effect body — functionally identical timing, just not on
    // the same tick as the commit.
    const showTimer = setTimeout(() => {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    }, 0);
    const hideTimer = setTimeout(() => setVisible(false), 900);
    const unmountTimer = setTimeout(() => setMounted(false), 1200);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(unmountTimer);
    };
  }, [trigger]);

  if (!mounted || amount <= 0) return null;

  return (
    <span
      aria-live="polite"
      className={cn(
        "pointer-events-none inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-500 transition-all duration-500 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <Zap size={12} />+{amount} {t("learning.xp")}
    </span>
  );
}
