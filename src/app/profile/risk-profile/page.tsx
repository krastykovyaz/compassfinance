"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { RiskProfileDetail } from "@/components/profile/risk-profile-detail";
import { useProgress } from "@/lib/progress-store";
import { getRiskProfile } from "@/lib/risk-profile/risk-profiles";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function RiskProfilePage() {
  const { state } = useProgress();
  const { t } = useTranslation();
  const profile = getRiskProfile(state.riskProfileId);

  return (
    <AppShell>
      <Header title={t("profile.investorProfile")} backHref="/profile" />

      <div className="space-y-4 px-5">
        <RiskProfileDetail profile={profile} />

        <Link
          href="/profile/risk-profile/assessment"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
        >
          {t("profile.retakeAssessment")}
        </Link>
      </div>
    </AppShell>
  );
}
