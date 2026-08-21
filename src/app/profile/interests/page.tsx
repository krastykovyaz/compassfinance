"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { InterestsCard } from "@/components/profile/interests-card";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function InterestsPage() {
  const { t } = useTranslation();

  return (
    <AppShell>
      <Header title={t("interests.title")} backHref="/profile" />
      <div className="px-5">
        <InterestsCard />
      </div>
    </AppShell>
  );
}
