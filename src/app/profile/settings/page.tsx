"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Link2, Bell, Users, Languages } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { AccountCard } from "@/components/profile/account-card";
import { LinkRow } from "@/components/profile/link-row";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { LOCALE_LABELS } from "@/lib/i18n/dictionaries";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { formatEnabledChannelsSummary } from "@/lib/notifications/format-channel-summary";
import { useNews } from "@/lib/news/use-news";
import { countDistinctSources } from "@/lib/news/count-distinct-sources";
import { useSession } from "next-auth/react";

// Moved out of the main Profile page (which now just links here via its
// header's settings gear, previously a dead button with no onClick at
// all) — this link-row list is settings/navigation, not profile identity
// content, so it belongs on its own screen rather than always inline.
export default function ProfileSettingsPage() {
  const { t, locale } = useTranslation();
  const { status } = useSession();
  const { channels: notificationChannels, loaded: notificationsLoaded } = useNotificationPreferences();
  const { items: newsItems, isLoading: newsLoading, error: newsError } = useNews();
  const trustedSourcesCount = countDistinctSources(newsItems);

  // Real connected-accounts count from Auth.js's own Account table — see
  // /api/user/profile-stats. Never a hardcoded value.
  const [connectedAccountsCount, setConnectedAccountsCount] = useState<number | null>(null);
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/user/profile-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.connectedAccountsCount === "number") {
          setConnectedAccountsCount(data.connectedAccountsCount);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  const enabledChannelsSummary = notificationsLoaded
    ? formatEnabledChannelsSummary(notificationChannels, {
        push: t("notifications.push"),
      })
    : null;

  return (
    <AppShell>
      <Header title={t("general.settings")} backHref="/profile" />
      <div className="space-y-5 px-5">
        <AccountCard variant="accountOnly" />

        <Card className="divide-y divide-border p-0 px-4">
          <LinkRow
            icon={Languages}
            label={t("profile.language")}
            trailing={LOCALE_LABELS[locale]}
            colorKey="purple"
            href="/profile/language"
          />
          <LinkRow
            icon={ShieldCheck}
            label={t("linkRows.trustedSources")}
            href="/profile/sources"
            trailing={
              !newsLoading && !newsError && newsItems.length > 0
                ? `${trustedSourcesCount} ${
                    trustedSourcesCount === 1
                      ? t("linkRows.trustedSourcesTrailing")
                      : t("linkRows.trustedSourcesTrailingPlural")
                  }`
                : undefined
            }
          />
          <LinkRow
            icon={Link2}
            label={t("linkRows.connectedAccounts")}
            trailing={
              connectedAccountsCount != null
                ? `${connectedAccountsCount} ${
                    connectedAccountsCount === 1
                      ? t("linkRows.connectedAccountsTrailing")
                      : t("linkRows.connectedAccountsTrailingPlural")
                  }`
                : undefined
            }
            colorKey="green"
          />
          <LinkRow
            icon={Bell}
            label={t("linkRows.notifications")}
            trailing={
              notificationsLoaded
                ? enabledChannelsSummary ?? t("notifications.noneEnabled")
                : undefined
            }
            colorKey="orange"
            href="/profile/notifications"
          />
          <LinkRow
            icon={Users}
            label={t("linkRows.inviteFriends")}
            trailing={t("linkRows.inviteFriendsTrailing")}
            colorKey="rose"
            href="/profile/invite"
          />
        </Card>
      </div>
    </AppShell>
  );
}
