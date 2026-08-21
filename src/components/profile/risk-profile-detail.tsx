import { Sprout, TrendingUp, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  RiskProfileDefinition,
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

const RISK_LEVEL_COLOR: Record<RiskProfileDefinition["riskLevel"], string> = {
  Low: "text-positive",
  Medium: "text-orange-600",
  High: "text-negative",
};

// Reusable detailed view for a single risk profile. Used on the current
// user's profile detail page, and could be reused to preview any of the
// three profiles (e.g. during the assessment) without duplicating markup.
// Milestone 9: all copy here (title, risk level, description, bullets,
// disclaimer) is read through t() from the profile's i18n dictionary
// section — see RISK_PROFILE_SECTION in risk-profiles.ts.
export function RiskProfileDetail({ profile }: { profile: RiskProfileDefinition }) {
  const Icon = PROFILE_ICON[profile.id];
  const { t } = useTranslation();
  const section = RISK_PROFILE_SECTION[profile.id];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink">
            <Icon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-semibold text-ink">{t(`${section}.title`)}</p>
            <p className={`text-[13px] font-medium ${RISK_LEVEL_COLOR[profile.riskLevel]}`}>
              {t(RISK_PROFILE_LEVEL_KEY[profile.id])}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[14px] leading-snug text-ink-muted">
          {t(`${section}.shortDescription`)}
        </p>
      </Card>

      <Card>
        <h2 className="text-[15px] font-semibold text-ink">{t("riskAssessment.howYouInvest")}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          {t(`${section}.howYouInvest`)}
        </p>
      </Card>

      <Card>
        <h2 className="text-[15px] font-semibold text-ink">
          {t("riskAssessment.whatYouMayPrefer")}
        </h2>
        <ul className="mt-2 space-y-1.5">
          {[1, 2, 3].map((n) => (
            <li key={n} className="flex gap-2 text-[13px] leading-relaxed text-ink-muted">
              <span className="text-ink-faint">•</span>
              <span>{t(`${section}.prefer${n}`)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-[15px] font-semibold text-ink">
          {t("riskAssessment.thingsToKeepInMind")}
        </h2>
        <ul className="mt-2 space-y-1.5">
          {[1, 2, 3].map((n) => (
            <li key={n} className="flex gap-2 text-[13px] leading-relaxed text-ink-muted">
              <span className="text-ink-faint">•</span>
              <span>{t(`${section}.keepInMind${n}`)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="px-1 text-center text-[11px] leading-relaxed text-ink-faint">
        {t("riskAssessment.disclaimer")}
      </p>
    </div>
  );
}
