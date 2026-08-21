import { SUPPORTED_LOCALES } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/types";
import { RISK_PROFILE_ORDER, type RiskProfileId } from "@/lib/risk-profile/risk-profiles";
import { INTEREST_CATEGORIES, type InterestCategoryId } from "@/lib/interests/interests";

export const NOTIFICATION_CATEGORIES = [
  "news",
  "priceAlerts",
  "learning",
  "achievements",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export function isValidLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isValidRiskProfileId(value: string): value is RiskProfileId {
  return (RISK_PROFILE_ORDER as readonly string[]).includes(value);
}

export function isValidInterestKey(value: string): value is InterestCategoryId {
  return INTEREST_CATEGORIES.some((c) => c.id === value);
}

export function isValidNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

// Delivery channels (Milestone 25) — deliberately a separate namespace from
// NOTIFICATION_CATEGORIES above: categories are "what kind of thing", these
// are "how it would reach you". Stored in the same UserNotificationPreference
// table (category = "channel:push" / "channel:email") rather than a second
// table, so there's still exactly one notification-preferences state.
export const NOTIFICATION_CHANNELS = ["push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function isValidNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}
