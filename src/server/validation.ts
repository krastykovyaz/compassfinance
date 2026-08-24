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
// table (category = "channel:push") rather than a second table, so there's
// still exactly one notification-preferences state.
//
// Notifications milestone: Email is deliberately NOT a valid channel —
// there is no email delivery implementation yet, and this array is the
// single source of truth every other "push"/"email" list in the codebase
// derives from, so narrowing it here removes Email everywhere at once
// (repository CHANNEL_DEFAULTS, the client hook, the Settings UI) rather
// than needing a second "is email actually enabled" flag.
export const NOTIFICATION_CHANNELS = ["push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function isValidNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

// Real product events the notification center persists rows for (see
// notification-events.ts). Streak milestones deliberately have no separate
// event here — they're already modeled as the SEVEN_DAY_STREAK achievement
// (src/lib/learning/achievements.ts) and go through achievement_earned.
export const NOTIFICATION_EVENT_TYPES = [
  "learning_completed",
  "investment_unlocked",
  "achievement_earned",
  "paper_trade_completed",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export function isValidNotificationEventType(value: string): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

/** A syntactically valid EVM address (checksum not enforced — case-
 * insensitive 40-hex-char form is accepted, matching what window.ethereum
 * returns). This never validates that the address is actually reachable
 * or has any Hyperliquid activity — that's a separate "unavailable"/
 * "empty account" concern handled by the Hyperliquid service layer. */
export function isValidEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}
