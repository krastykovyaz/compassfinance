"use client";

import { createContext, ReactNode, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  INITIAL_NAVIGATION_HISTORY_STATE,
  NavigationHistoryState,
  observePathname,
  shouldUseRealHistory,
} from "./navigation-history";

const NavigationHistoryContext = createContext<NavigationHistoryState>(
  INITIAL_NAVIGATION_HISTORY_STATE
);

/**
 * Mounted once in the root layout, alongside ProgressProvider/LocaleProvider.
 * Owns ONLY the React side of tracking pathname changes — every actual
 * decision (has the user navigated within the app this session?) is made
 * by the pure functions in navigation-history.ts.
 *
 * Uses React's documented "adjust state during rendering" pattern
 * (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
 * rather than a useEffect, so a pathname change is folded in during the
 * same render pass instead of causing an extra effect-driven render.
 */
export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<NavigationHistoryState>(INITIAL_NAVIGATION_HISTORY_STATE);
  const [observedPathname, setObservedPathname] = useState<string | null>(null);

  if (pathname !== observedPathname) {
    setObservedPathname(pathname);
    setState((s) => observePathname(s, pathname));
  }

  return (
    <NavigationHistoryContext.Provider value={state}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

/**
 * Returns a function a Header's Back button can call directly: retraces
 * real browser history when the user actually navigated here from inside
 * Compass, otherwise pushes the caller-supplied safe fallback (Part 5,
 * item 16 — never hardcode Home unless Home genuinely IS the right
 * fallback for that screen).
 */
export function useSmartBack(fallbackHref: string) {
  const router = useRouter();
  const historyState = useContext(NavigationHistoryContext);

  return () => {
    if (shouldUseRealHistory(historyState)) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };
}
