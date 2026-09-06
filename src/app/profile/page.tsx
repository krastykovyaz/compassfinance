"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskProfile } from "@/components/profile/risk-profile";
import { WalletCard } from "@/components/profile/wallet-card";
import { LearningProgressCard } from "@/components/learning/learning-progress";
import { AccountCard } from "@/components/profile/account-card";
import { useProgress } from "@/lib/progress-store";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { INTEREST_CATEGORIES } from "@/lib/interests/interests";

// Milestone 9: "Themes" (Explore) and "Investor Interests" (Profile) were
// the same concept shown two different ways. This card is now the single
// place for it — it shows the user's actual selected interests (not a
// static mock list) and its Edit link opens /profile/interests, which
// hosts the real select/deselect UI (InterestsCard). Explore's old
// "Themes" card was removed entirely rather than kept as a second,
// out-of-sync view of the same state.
export default function ProfilePage() {
  const { state, learningProgress } = useProgress();
  const { t } = useTranslation();

  const followedInterests = INTEREST_CATEGORIES.filter((c) => state.interests.includes(c.id));

  return (
    <AppShell>
      <Header
        title={t("profile.profile")}
        rightSlot={
          <Link
            href="/profile/settings"
            aria-label={t("general.settings")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <Settings size={20} />
          </Link>
        }
      />

      <div className="space-y-5 px-5">
        <AccountCard variant="guestOnly" />
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
      </div>
    </AppShell>
  );
}
