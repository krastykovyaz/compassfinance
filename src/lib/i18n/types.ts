// Locale type for Compass's lightweight i18n system (Milestone 9).
//
// Only the locales a user can actually select live in this union. Chinese
// ("zh") is an explicit future target (see dictionaries.ts) but is
// deliberately NOT part of this union yet — the brief is clear that it
// must not be exposed as a selectable language this milestone. Adding it
// later is a two-file change (this union + translations/zh.ts +
// registering it in dictionaries.ts) and touches zero React components,
// because every component goes through t()/useTranslation() rather than
// switching on locale itself.
export type Locale = "en" | "fr" | "ru";
