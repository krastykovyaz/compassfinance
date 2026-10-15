// Floating hint bubbles: one short tip per main screen, shown the first time
// the user opens it. Which tip belongs to which screen lives here (pure data,
// no React) so it can be tested; the bubble itself is components/tips/
// screen-tips.tsx. Text lives in the i18n dictionaries under `tips.*`.

export type ScreenTip = {
  /** Stable id: what "dismissed" remembers. Never reuse an id for a tip whose
   * meaning changed - give it a new one so people see the new text. */
  id: string;
  /** The screen's exact pathname. */
  path: string;
  titleKey: string;
  bodyKey: string;
};

export const SCREEN_TIPS: ScreenTip[] = [
  { id: "home-v1", path: "/", titleKey: "tips.homeTitle", bodyKey: "tips.homeBody" },
  { id: "explore-v1", path: "/explore", titleKey: "tips.exploreTitle", bodyKey: "tips.exploreBody" },
  { id: "learn-v1", path: "/learn", titleKey: "tips.learnTitle", bodyKey: "tips.learnBody" },
  { id: "markets-v1", path: "/markets", titleKey: "tips.marketsTitle", bodyKey: "tips.marketsBody" },
  { id: "news-v1", path: "/news", titleKey: "tips.newsTitle", bodyKey: "tips.newsBody" },
  { id: "portfolio-v1", path: "/portfolio", titleKey: "tips.portfolioTitle", bodyKey: "tips.portfolioBody" },
  {
    id: "connected-accounts-v1",
    path: "/profile/connected-accounts",
    titleKey: "tips.connectedAccountsTitle",
    bodyKey: "tips.connectedAccountsBody",
  },
];

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function getTipForPath(pathname: string): ScreenTip | null {
  const path = normalizePath(pathname);
  return SCREEN_TIPS.find((tip) => tip.path === path) ?? null;
}

// What this browser remembers: which tips were dismissed, and whether the user
// turned tips off altogether. Per device on purpose - a hint is a convenience,
// not account data. Every access is guarded: storage can be blocked or full.
const STORAGE_KEY = "compass.tips.v1";

export type TipPreferences = { dismissed: string[]; off: boolean };

export function readTipPreferences(storage: Pick<Storage, "getItem"> | null): TipPreferences {
  const empty: TipPreferences = { dismissed: [], off: false };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<TipPreferences> | null;
    const dismissed = Array.isArray(parsed?.dismissed) ? parsed.dismissed.filter((id): id is string => typeof id === "string") : [];
    return { dismissed, off: parsed?.off === true };
  } catch {
    return empty;
  }
}

export function writeTipPreferences(storage: Pick<Storage, "setItem"> | null, prefs: TipPreferences): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Blocked or full: the tip simply shows again next visit.
  }
}

export function shouldShowTip(tip: ScreenTip | null, prefs: TipPreferences): tip is ScreenTip {
  return tip !== null && !prefs.off && !prefs.dismissed.includes(tip.id);
}
