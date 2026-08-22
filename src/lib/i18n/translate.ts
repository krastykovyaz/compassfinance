// Pure translation-resolution logic — no React, no localStorage, no
// navigator. Kept separate from locale-provider.tsx (which owns the React
// context + persistence + browser-locale detection) so the actual lookup
// and fallback behavior can be unit-tested directly, the same way
// learning/achievements.ts's predicates are tested without mounting a
// provider.

import { DICTIONARIES, ENGLISH_DICTIONARY, SUPPORTED_LOCALES } from "./dictionaries";
import { Locale } from "./types";

/**
 * Reads a dot-path (e.g. "navigation.home") out of a nested object.
 * Never throws — an absent segment just short-circuits to undefined.
 */
export function getByPath(source: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" && key in (acc as Record<string, unknown>)
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      source
    );
}

/**
 * Resolves a translation key against a given locale's dictionary, falling
 * back to English if the key is missing there, and finally to the raw key
 * itself if it's missing from English too (which should only happen for a
 * typo'd key during development — this must never crash the app).
 */
export function translate(locale: Locale, key: string): string {
  const dict = DICTIONARIES[locale] ?? ENGLISH_DICTIONARY;
  const value = getByPath(dict, key);
  if (typeof value === "string") return value;

  const fallback = getByPath(ENGLISH_DICTIONARY, key);
  if (typeof fallback === "string") return fallback;

  return key;
}

/**
 * Locale resolution priority, per the Milestone 9 brief:
 *   1. explicit user selection (handled by the caller — this function is
 *      only reached when there isn't one yet)
 *   2. persisted locale (`storedLocale`, already validated as supported)
 *   3. browser/device locale, if supported
 *   4. English fallback
 */
export function resolveInitialLocale(
  storedLocale: string | null,
  browserLanguages: readonly string[]
): Locale {
  if (storedLocale && isSupportedLocale(storedLocale)) return storedLocale;

  for (const lang of browserLanguages) {
    const base = lang.slice(0, 2).toLowerCase();
    if (isSupportedLocale(base)) return base;
  }

  return "en";
}

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as string[]).includes(value);
}

/**
 * Coerces a raw, possibly-absent locale value (e.g. a User.locale DB
 * column, which is a plain nullable string) into a real Locale, falling
 * back to English. Used wherever a *stored* locale needs to drive a
 * server-rendered page for a visitor who isn't the one who set it — e.g.
 * rendering a shared/invite link in the sharer's language rather than the
 * viewer's.
 */
export function toSupportedLocale(value: string | null | undefined): Locale {
  return value && isSupportedLocale(value) ? value : "en";
}
