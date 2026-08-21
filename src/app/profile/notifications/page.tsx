"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { NotificationsCard } from "@/components/profile/notifications-card";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function NotificationsPage() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <Header title={t("linkRows.notifications")} backHref="/profile" />
      <div className="px-5">
        <NotificationsCard />
      </div>
    </AppShell>
  );
}
