// Centralized risk-profile data model.
//
// This is deliberately ONLY about risk appetite (low/medium/high) — not
// ESG, ethical investing, sustainability, or sector preferences. Those are
// a separate, future feature. "Impact Investor" here is the HIGH-risk
// profile, not an ESG label — don't reinterpret it.
//
// Milestone 9: all display copy (title, risk-level label, descriptions,
// bullet lists) now lives in the i18n dictionaries under
// riskProfileBeginner/riskProfileWealth/riskProfileImpact + riskLevels
// (see src/lib/i18n/translations/en.ts) rather than as raw English
// strings here. This file only holds the STRUCTURAL data (id, numeric
// risk level for sorting/comparison, which dictionary section to read)
// so there's exactly one place to add a new profile, but zero raw copy
// to keep in sync across languages by hand. UI components call
// t(RISK_PROFILE_SECTION[id] + ".title") etc. — see RISK_PROFILE_SECTION
// and RISK_PROFILE_LEVEL_KEY below.

export type RiskProfileId = "BEGINNER_EXPLORER" | "WEALTH_BUILDER" | "IMPACT_INVESTOR";

export type RiskLevel = "Low" | "Medium" | "High";

export type RiskProfileDefinition = {
  id: RiskProfileId;
  riskLevel: RiskLevel;
};

export const RISK_PROFILE_ORDER: RiskProfileId[] = [
  "BEGINNER_EXPLORER",
  "WEALTH_BUILDER",
  "IMPACT_INVESTOR",
];

export const RISK_PROFILES: Record<RiskProfileId, RiskProfileDefinition> = {
  BEGINNER_EXPLORER: { id: "BEGINNER_EXPLORER", riskLevel: "Low" },
  WEALTH_BUILDER: { id: "WEALTH_BUILDER", riskLevel: "Medium" },
  IMPACT_INVESTOR: { id: "IMPACT_INVESTOR", riskLevel: "High" },
};

export const DEFAULT_RISK_PROFILE_ID: RiskProfileId = "WEALTH_BUILDER";

/** i18n dictionary section for each profile's title/descriptions/bullets. */
export const RISK_PROFILE_SECTION: Record<RiskProfileId, string> = {
  BEGINNER_EXPLORER: "riskProfileBeginner",
  WEALTH_BUILDER: "riskProfileWealth",
  IMPACT_INVESTOR: "riskProfileImpact",
};

// Kept for any code that still wants a single "display name" key directly
// (e.g. the compact Profile card) — same section, `.title` key.
export const RISK_PROFILE_LABEL_KEY: Record<RiskProfileId, string> = {
  BEGINNER_EXPLORER: "riskProfileBeginner.title",
  WEALTH_BUILDER: "riskProfileWealth.title",
  IMPACT_INVESTOR: "riskProfileImpact.title",
};

/** i18n key (under riskLevels.*) for a profile's risk-level badge. */
export const RISK_PROFILE_LEVEL_KEY: Record<RiskProfileId, string> = {
  BEGINNER_EXPLORER: "riskLevels.low",
  WEALTH_BUILDER: "riskLevels.medium",
  IMPACT_INVESTOR: "riskLevels.high",
};

export function getRiskProfile(id: RiskProfileId | null | undefined): RiskProfileDefinition {
  if (id && id in RISK_PROFILES) return RISK_PROFILES[id];
  return RISK_PROFILES[DEFAULT_RISK_PROFILE_ID];
}
