"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { InviteFriendsCard } from "@/components/invite/invite-friends-card";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function InviteFriendsPage() {
  const { t } = useTranslation();
  return (
    <AppShell>
      <Header title={t("linkRows.inviteFriends")} backHref="/profile" />
      <div className="px-5">
        <InviteFriendsCard />
      </div>
    </AppShell>
  );
}
