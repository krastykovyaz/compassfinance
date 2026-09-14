"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { encodeContextKey, type CompassContext } from "./context";
import { CompassEntryButton } from "@/components/compass/compass-entry-button";
import { CompassSheet } from "@/components/compass/compass-sheet";

// Compass is NOT a bottom-navigation tab (Phase 4, Section 28) — it is a
// single, app-wide floating entry point whose CONTEXT changes with
// whatever screen the user is actually on. This provider is the one
// place that context lives: screens declare themselves as "current" via
// useSetCompassContext, and any "Ask Compass about X" button anywhere in
// the app can call open() with an explicit context override (e.g. the
// Asset page's own CTA always opens with ASSET context regardless of
// what the floating pill would have used).

export type CompassUiValue = {
  context: CompassContext;
  setContext: (context: CompassContext) => void;
  isOpen: boolean;
  open: (context?: CompassContext) => void;
  close: () => void;
};

const CompassUiContext = createContext<CompassUiValue | null>(null);

export const COMPASS_DEFAULT_CONTEXT: CompassContext = { type: "HOME" };

export function CompassProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<CompassContext>(COMPASS_DEFAULT_CONTEXT);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((override?: CompassContext) => {
    if (override) setContext(override);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ context, setContext, isOpen, open, close }), [context, isOpen, open, close]);

  return (
    <CompassUiContext.Provider value={value}>
      {children}
      <CompassEntryButton />
      <CompassSheet />
    </CompassUiContext.Provider>
  );
}

export function useCompassUi(): CompassUiValue {
  const ctx = useContext(CompassUiContext);
  if (!ctx) throw new Error("useCompassUi must be used within a CompassProvider");
  return ctx;
}

/** Screens call this to declare "I am the currently active Compass
 * context" for as long as they're mounted, resetting to HOME on unmount
 * so a stale context (e.g. a specific ASSET) never lingers onto an
 * unrelated screen the user navigates to next. Depends only on the
 * context's own (type, encoded key) pair — not the object reference
 * itself, which is a fresh literal on every render of the calling
 * screen. */
export function useSetCompassContext(context: CompassContext) {
  const { setContext } = useCompassUi();
  const type = context.type;
  const key = encodeContextKey(context);

  useEffect(() => {
    setContext(context);
    return () => setContext(COMPASS_DEFAULT_CONTEXT);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- context is re-derived from the stable (type, key) pair, not the object identity
  }, [type, key]);
}
