"use client";

import { Languages, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

// A plain, always-expanded picker (no popover/menu dependency needed for
// three options) — persists via LocaleProvider's setLocale(). For
// authenticated users (Milestone 11.1) that means the database via
// /api/user/profile; localStorage is only ever used pre-auth/anonymously
// and is never read back once signed in (see locale-provider.tsx).
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Languages size={16} className="text-ink-faint" />
        <p className="text-[13px] font-medium text-ink-muted">{t("profile.language")}</p>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {SUPPORTED_LOCALES.map((code) => {
          const active = code === locale;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={active}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-[14px] font-medium transition-colors",
                active
                  ? "border-ink bg-ink text-surface"
                  : "border-border bg-surface text-ink hover:bg-surface-2"
              )}
            >
              {LOCALE_LABELS[code]}
              {active ? <Check size={16} /> : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
