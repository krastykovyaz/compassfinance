"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function LanguagePage() {
  const { t } = useTranslation();

  return (
    <AppShell>
      <Header title={t("profile.language")} backHref="/profile" />
      <div className="px-5">
        <LanguageSwitcher />
      </div>
    </AppShell>
  );
}
