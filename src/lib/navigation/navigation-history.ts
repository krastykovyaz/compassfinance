// Pure logic backing the "use real navigation history for Back" fix
// (Milestone 9, Part 5). Kept framework-free so it's directly unit-
// testable, the same split used throughout this codebase (reducer.ts,
// translate.ts) — the React wiring lives in navigation-history-provider.tsx
// and should contain no branching logic of its own.
//
// The core idea: a nested screen's Back button should call the browser's
// real history.back() whenever the user actually navigated here from
// somewhere else inside Compass (so Back retraces that path exactly,
// including through intermediate screens like News Detail -> Asset ->
// Back -> News Detail). If the screen was opened directly — a deep link,
// a fresh tab, a hard refresh with no prior in-app navigation — there's no
// meaningful history to retrace, so Back should use the screen's own safe
// fallback destination instead of yanking the user to Home or nowhere.
//
// "Has the user navigated within the app this session?" is tracked as a
// one-way flag rather than a depth counter: once true it stays true,
// because even a single client-side navigation means real browser history
// now exists to go back through. A counter that also decremented on
// popstate would work too, but would have to special-case distinguishing
// "the user pressed Back" from "the user clicked Home in bottom nav" to
// avoid under/over-counting — the boolean sidesteps that entirely and is
// enough to satisfy every case in the brief (tests 22-26).

export type NavigationHistoryState = {
  /** The most recent pathname this state has observed. */
  lastPathname: string | null;
  /** True once at least one client-side pathname change has been observed. */
  hasInternalHistory: boolean;
};

export const INITIAL_NAVIGATION_HISTORY_STATE: NavigationHistoryState = {
  lastPathname: null,
  hasInternalHistory: false,
};

/**
 * Folds one observed pathname into the running state. Called on every
 * pathname change (including the very first one, on mount).
 */
export function observePathname(
  state: NavigationHistoryState,
  pathname: string
): NavigationHistoryState {
  if (state.lastPathname === null) {
    // First pathname ever seen this session — not a navigation yet.
    return { lastPathname: pathname, hasInternalHistory: state.hasInternalHistory };
  }
  if (state.lastPathname === pathname) {
    // Re-render with the same route (e.g. query-string-only change) — no-op.
    return state;
  }
  return { lastPathname: pathname, hasInternalHistory: true };
}

/**
 * Decides what a Header's Back button should do: retrace real history, or
 * jump to the section's own safe fallback (per-screen, passed in by the
 * caller — see Header's `backHref` prop). Never defaults to Home unless
 * the caller's own fallback IS Home (e.g. the asset/position pages, which
 * intentionally use "/").
 */
export function shouldUseRealHistory(state: NavigationHistoryState): boolean {
  return state.hasInternalHistory;
}
