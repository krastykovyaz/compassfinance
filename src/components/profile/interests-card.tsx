"use client";

import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useProgress } from "@/lib/progress-store";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { INTEREST_CATEGORIES } from "@/lib/interests/interests";
import { cn } from "@/lib/utils";

// Deliberately its own card, visually separate from <RiskProfile /> above
// it on the Profile page — Part 4, item 13 is explicit that risk profile
// and interests must read as two different concepts, not one settings
// blob. Selecting/deselecting goes through progress-store's
// toggleInterest(), which is server-authoritative for authenticated users
// (Milestone 11.1) — optimistic UI, PATCH/POST/DELETE to /api/user/interests,
// rolled back on failure — and localStorage-backed only for anonymous
// visitors.
export function InterestsCard() {
  const { state, toggleInterest } = useProgress();
  const { t } = useTranslation();

  return (
    <Card>
      <p className="text-[13px] font-medium text-ink-muted">{t("interests.title")}</p>
      <p className="mt-0.5 text-xs text-ink-faint">{t("interests.subtitle")}</p>
      <div className="mt-3 flex flex-col gap-1.5">
        {INTEREST_CATEGORIES.map((category) => {
          const selected = state.interests.includes(category.id);
          return (
            <button
              key={category.id}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => toggleInterest(category.id)}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-[14px] font-medium transition-colors",
                selected
                  ? "border-purple/40 bg-purple-50 text-purple-700"
                  : "border-border bg-surface text-ink hover:bg-surface-2"
              )}
            >
              {t(category.labelKey)}
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                  selected ? "border-purple-600 bg-purple-600 text-white" : "border-border"
                )}
              >
                {selected ? <Check size={13} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
