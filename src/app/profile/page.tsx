"use client";

import { useEffect, useState } from "react";
import { Settings, ShieldCheck, Link2, Bell, Users, Languages } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskProfile } from "@/components/profile/risk-profile";
import { WalletCard } from "@/components/profile/wallet-card";
import { LinkRow } from "@/components/profile/link-row";
import { LearningProgressCard } from "@/components/learning/learning-progress";
import { AccountCard } from "@/components/profile/account-card";
import { useProgress } from "@/lib/progress-store";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { LOCALE_LABELS } from "@/lib/i18n/dictionaries";
import { INTEREST_CATEGORIES } from "@/lib/interests/interests";
import { useNotificationPreferences } from "@/lib/notifications/use-notification-preferences";
import { formatEnabledChannelsSummary } from "@/lib/notifications/format-channel-summary";
import { useNews } from "@/lib/news/use-news";
import { countDistinctSources } from "@/lib/news/count-distinct-sources";
import { useSession } from "next-auth/react";

// Milestone 9: "Themes" (Explore) and "Investor Interests" (Profile) were
// the same concept shown two different ways. This card is now the single
// place for it — it shows the user's actual selected interests (not a
// static mock list) and its Edit link opens /profile/interests, which
// hosts the real select/deselect UI (InterestsCard). Explore's old
// "Themes" card was removed entirely rather than kept as a second,
// out-of-sync view of the same state.
export default function ProfilePage() {
  const { state, learningProgress } = useProgress();
  const { t, locale } = useTranslation();
  const { status } = useSession();
  const { channels: notificationChannels, loaded: notificationsLoaded } = useNotificationPreferences();
  // Real "trusted sources" count: this app has no separate curated-source
  // registry, so — rather than inventing one or showing a fake number —
  // it's the count of distinct real publisher names currently present in
  // the same news pipeline the News screen and Home's Insight card
  // already use (useNews() -> /api/news -> Marketaux). It updates
  // automatically whenever that data does, and there's nothing here that
  // recomputes or duplicates the news fetch itself.
  const { items: newsItems, isLoading: newsLoading, error: newsError } = useNews();
  const trustedSourcesCount = countDistinctSources(newsItems);

  const followedInterests = INTEREST_CATEGORIES.filter((c) => state.interests.includes(c.id));

  // Real connected-accounts count from Auth.js's own Account table — see
  // /api/user/profile-stats. Never the old hardcoded "1".
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

  // Real summary of which delivery channels are actually enabled —
  // Milestone 25: this app now has a real (if undelivered) push/email
  // channel-preferences layer, so this reads that state instead of the
  // old content-category count. Never a hardcoded "Push, email".
  const enabledChannelsSummary = notificationsLoaded
    ? formatEnabledChannelsSummary(notificationChannels, {
        push: t("notifications.push"),
        email: t("notifications.email"),
      })
    : null;

  return (
    <AppShell>
      <Header
        title={t("profile.profile")}
        rightSlot={
          <button
            aria-label={t("general.settings")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <Settings size={20} />
          </button>
        }
      />

      <div className="space-y-5 px-5">
        <AccountCard />
        <RiskProfile />

        <LearningProgressCard progress={learningProgress} variant="compact" />

        <WalletCard />

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-muted">{t("profile.followedThemes")}</p>
            <a href="/profile/interests" className="text-[13px] font-medium text-blue">
              {t("general.edit")}
            </a>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {followedInterests.length > 0 ? (
              followedInterests.map((category) => (
                <Badge key={category.id} colorKey="purple">
                  {t(category.labelKey)}
                </Badge>
              ))
            ) : (
              <p className="text-[13px] text-ink-faint">{t("interests.subtitle")}</p>
            )}
          </div>
        </Card>

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
