// Pure helpers behind the Home page greeting — no React, no next-auth
// import here, so the time-of-day/name-parsing logic is directly
// testable without mounting a session provider. page.tsx is the only
// place that wires these to the real Auth.js session and the real clock.

export type GreetingPeriod = "morning" | "afternoon" | "evening";

/**
 * Morning: 00:00–11:59, afternoon: 12:00–16:59, evening: 17:00–23:59
 * (local time). A plain, deterministic function of an hour so it's
 * trivial to test every boundary without faking the system clock.
 */
export function getGreetingPeriod(date: Date = new Date()): GreetingPeriod {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const GREETING_KEY: Record<GreetingPeriod, string> = {
  morning: "home.goodMorning",
  afternoon: "home.goodAfternoon",
  evening: "home.goodEvening",
};

export function getGreetingKey(period: GreetingPeriod): string {
  return GREETING_KEY[period];
}

/**
 * Extracts a usable first/given name from a full name string (e.g. a
 * Google OAuth display name). Returns null when there's nothing usable —
 * missing, empty, or whitespace-only — so the caller falls back to the
 * generic greeting rather than showing an empty/broken name.
 */
export function getFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}

/**
 * The full greeting decision in one place: which i18n key to show, and
 * what name (if any) to append. `isAuthenticated` and `fullName` should
 * come straight from the Auth.js session — never mock-data, never a
 * second auth source. A name is only ever shown when authenticated AND a
 * usable name exists; every other case falls back to the generic,
 * un-personalized greeting.
 */
export function getGreetingParts(
  isAuthenticated: boolean,
  fullName: string | null | undefined,
  period: GreetingPeriod = getGreetingPeriod()
): { key: string; name: string | null } {
  return {
    key: getGreetingKey(period),
    name: isAuthenticated ? getFirstName(fullName) : null,
  };
}
