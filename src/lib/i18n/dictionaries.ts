import en, { Dictionary } from "./translations/en";
import fr from "./translations/fr";
import ru from "./translations/ru";
import { Locale } from "./types";

// The only locales a user can currently select. Order here drives the
// order shown in the language switcher.
export const SUPPORTED_LOCALES: Locale[] = ["en", "fr", "ru"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  ru: "Русский",
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, fr, ru };

export const DEFAULT_LOCALE: Locale = "en";

export const ENGLISH_DICTIONARY = en;

// ---------------------------------------------------------------------------
// Future Chinese ("zh") support
// ---------------------------------------------------------------------------
// This is the ONLY file a future "zh" locale needs to touch, along with:
//   1. add "zh" to the Locale union in ./types.ts
//   2. add ./translations/zh.ts (typed as `Dictionary`, same shape as en.ts)
//   3. import it above and add it to SUPPORTED_LOCALES/LOCALE_LABELS/DICTIONARIES
// No component imports DICTIONARIES, SUPPORTED_LOCALES, or Locale directly
// for rendering strings — they all go through useTranslation()'s t(), which
// resolves whatever the current locale's dictionary contains (falling back
// to English for anything missing). So step 3 above is genuinely the whole
// change; no JSX anywhere needs to know a new locale exists.
//
// This is also why the educational lesson/quiz content in
// src/lib/learning/content/ was deliberately left as plain English strings
// rather than being run through the dictionary system in this milestone:
// that content is prose, not short UI labels, and the brief for this
// milestone is explicit that dynamic content translation (EN/FR/RU/ZH) is
// future LLM-generation work, not something to fake with static copies now.
