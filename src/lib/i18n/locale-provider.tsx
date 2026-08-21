"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./dictionaries";
import { resolveInitialLocale, translate } from "./translate";
import { Locale } from "./types";

// Milestone 11.1, Section 5: for an authenticated user, locale comes from
// their database profile — this key is only ever read/written for
// anonymous visitors (or as the pre-auth starting value before the first
// /api/user/profile fetch resolves). It is never used to override a
// value the database already returned.
const STORAGE_KEY = "compass-locale-v1";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Translate a dot-path key, e.g. t("navigation.home"). Never throws —
   * see translate.ts for the fallback chain. */
  t: (key: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isValidLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Owns: current locale state, translation lookup, and — depending on auth
 * status — either localStorage/browser-detected persistence (anonymous)
 * or database-backed persistence (authenticated). The actual key lookup +
 * fallback logic lives in translate.ts as plain functions so it's unit-
 * testable without mounting this provider — same split as
 * progress-store.tsx / reducer.ts.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const { status: sessionStatus, data: session } = useSession();
  const userId = session?.user?.id ?? null;
  // Tracks whether we've already applied the authenticated user's DB
  // locale this "session" (i.e. for this userId) — prevents a stray
  // localStorage-driven setLocale from re-overwriting it, and prevents
  // re-fetching the profile locale on every unrelated re-render.
  const appliedServerLocaleFor = useRef<string | null>(null);

  // Anonymous/pre-auth starting value — resolved after mount (avoids an
  // SSR/client markup mismatch, same pattern as ProgressProvider's
  // hydration effect). This never runs again once a user is authenticated
  // and their DB locale has been applied (see effect below).
  useEffect(() => {
    if (sessionStatus === "authenticated") return;
    const timer = setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const browserLanguages =
          typeof navigator !== "undefined"
            ? navigator.languages && navigator.languages.length
              ? navigator.languages
              : [navigator.language]
            : [];
        setLocaleState(resolveInitialLocale(stored, browserLanguages));
      } catch {
        // localStorage/navigator unavailable — stay on the English default.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [sessionStatus]);

  // Authenticated: the database is authoritative (Section 5). Fetch the
  // user's saved locale and use it — never the localStorage value — the
  // instant we know who's signed in. If they've never set one (null),
  // fall back to whatever was just resolved above (browser/local) and
  // persist THAT to the database, so it becomes authoritative from here on.
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !userId) {
      appliedServerLocaleFor.current = null;
      return;
    }
    if (appliedServerLocaleFor.current === userId) return;

    let cancelled = false;
    fetch("/api/user/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((profile: { locale?: string | null } | null) => {
        if (cancelled) return;
        appliedServerLocaleFor.current = userId;
        if (profile && isValidLocale(profile.locale)) {
          setLocaleState(profile.locale);
        } else {
          // No locale on record yet — seed it from the current (browser/
          // local-cache) value so the database becomes authoritative going
          // forward, matching "use the persisted value on the next
          // session" once there IS a persisted value.
          setLocaleState((current) => {
            fetch("/api/user/profile", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ locale: current }),
            }).catch(() => {
              // best-effort seed — worst case the user picks a language
              // explicitly and that PATCH (in setLocale below) succeeds
            });
            return current;
          });
        }
      })
      .catch(() => {
        // offline / API unavailable — keep whatever anonymous value was
        // showing; next successful load will reconcile
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, userId]);

  const setLocale = useCallback(
    (next: Locale) => {
      const previous = locale;
      setLocaleState(next); // immediate UI update, per Section 5's flow
      if (sessionStatus === "authenticated") {
        fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: next }),
        }).catch(() => {
          // Roll back rather than permanently show an unsaved locale —
          // same "don't silently pretend it persisted" rule as risk
          // profile/interests.
          setLocaleState(previous);
        });
        // Deliberately no localStorage write here — Section 5: "Do not
        // require localStorage for authenticated locale persistence,"
        // and writing it would risk it later being read back and
        // overriding the database value, which Section 5 explicitly
        // forbids.
        return;
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore quota/storage errors — anonymous cache only
      }
    },
    [locale, sessionStatus]
  );

  const t = useMemo(() => (key: string) => translate(locale, key), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslation must be used within a LocaleProvider");
  return ctx;
}

export { SUPPORTED_LOCALES };
