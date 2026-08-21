"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sprout, TrendingUp, Rocket } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { useProgress } from "@/lib/progress-store";
import {
  RISK_PROFILE_ORDER,
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

// The single-question risk-appetite assessment: pick the profile that best
// matches how you'd like to invest. This is the only assessment
// implementation in the app — the widget and detail page both link here.
export default function RiskAssessmentPage() {
  const router = useRouter();
  const { state, setRiskProfile } = useProgress();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<RiskProfileId>(state.riskProfileId);

  function handleConfirm() {
    setRiskProfile(selected);
    router.push("/profile/risk-profile");
  }

  return (
    <AppShell>
      <Header title={t("riskAssessment.title")} backHref="/profile/risk-profile" />

      <div className="space-y-4 px-5">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          {t("riskAssessment.subtitle")}
        </p>

        <div className="space-y-3">
          {RISK_PROFILE_ORDER.map((id) => {
            const Icon = PROFILE_ICON[id];
            const isSelected = selected === id;
            const section = RISK_PROFILE_SECTION[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                className="block w-full text-left"
              >
                <Card
                  className={
                    isSelected
                      ? "border-ink transition-colors"
                      : "transition-colors active:bg-surface-2"
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink">
                      <Icon size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-ink">{t(`${section}.title`)}</p>
                      <p className="text-[13px] text-ink-muted">
                        {t(RISK_PROFILE_LEVEL_KEY[id])}
                      </p>
                    </div>
                    {isSelected ? (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-surface">
                        <Check size={14} />
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[13px] leading-snug text-ink-muted">
                    {t(`${section}.shortDescription`)}
                  </p>
                </Card>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleConfirm}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
        >
          {t("riskAssessment.saveProfile")}
        </button>
      </div>
    </AppShell>
  );
}
