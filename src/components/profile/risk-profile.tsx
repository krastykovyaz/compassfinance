"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Sprout, TrendingUp, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useProgress } from "@/lib/progress-store";
import {
  getRiskProfile,
  RiskProfileId,
  RISK_PROFILE_SECTION,
  RISK_PROFILE_LEVEL_KEY,
} from "@/lib/risk-profile/risk-profiles";
import { useTranslation } from "@/lib/i18n/locale-provider";

const PROFILE_ICON: Record<RiskProfileId, typeof Sprout> = {
  BEGINNER_EXPLORER: Sprout,
  WEALTH_BUILDER: TrendingUp,
  IMPACT_INVESTOR: Rocket,
};

// Compact widget for the Profile page. Shows the user's currently selected
// risk-appetite profile; tapping it opens the full explanation. The
// "Retake assessment" link is a nested interactive target, so the card
// itself is a clickable div (not an <a>) to avoid nesting anchor tags.
export function RiskProfile() {
  const router = useRouter();
  const { state } = useProgress();
  const { t } = useTranslation();
  const profile = getRiskProfile(state.riskProfileId);
  const Icon = PROFILE_ICON[profile.id];
  const section = RISK_PROFILE_SECTION[profile.id];

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => router.push("/profile/risk-profile")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push("/profile/risk-profile");
      }}
      className="cursor-pointer transition-colors active:bg-surface-2"
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-muted">{t("profile.investorProfile")}</p>
        <ChevronRight size={16} className="text-ink-faint" />
      </div>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink">
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-ink">{t(`${section}.title`)}</p>
          <p className="text-[13px] text-ink-muted">{t(RISK_PROFILE_LEVEL_KEY[profile.id])}</p>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-muted">
        {t(`${section}.shortDescription`)}
      </p>
      <Link
        href="/profile/risk-profile/assessment"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-block text-[13px] font-medium text-blue"
      >
        {t("profile.retakeAssessment")}
      </Link>
    </Card>
  );
}
