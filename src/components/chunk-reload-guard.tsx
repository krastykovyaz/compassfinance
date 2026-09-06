"use client";

// Real, reported bug: a user's browser had the app open (foreground or
// backgrounded/PWA) from before a deploy replaced every JS chunk file
// with new content-hashed names. The next time that tab tried to
// navigate/lazy-load a route, it requested an old chunk that no longer
// exists on the server — confirmed in nginx's access log as a 500 for
// /_next/static/chunks/<hash>.js — which Next.js has no automatic
// recovery for, so the whole page died with a generic "This page
// couldn't load" browser-level error. This is an inherent consequence of
// deploying by rebuilding + restarting the same process in place (no
// blue-green/old-build retention), and will recur on every future
// deploy for anyone with a tab open across it, so it's fixed structurally
// here rather than by asking users to manually hard-reload each time.
//
// This component renders nothing — it only listens for a stale-chunk
// load failure and force-reloads ONCE, automatically self-healing the
// session onto the current deployed build. Guarded by sessionStorage so
// a genuinely broken deploy can't reload-loop the tab forever. See
// chunk-reload-guard-logic.ts for the pure (unit-tested) matching rules.

import { useEffect } from "react";
import { isStaleNextChunkSrc, looksLikeStaleChunkError } from "@/lib/chunk-reload-guard-logic";

const RELOAD_GUARD_KEY = "compass:chunk-reload-guard";

function reloadOnce() {
  // sessionStorage (not a module-level flag) survives the very reload
  // this triggers, which a plain in-memory flag would not — that's the
  // whole point of the guard.
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return; // already tried once this session — don't loop
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  } catch {
    // sessionStorage unavailable (e.g. private browsing edge cases) —
    // reload once anyway rather than leaving the page dead; worst case
    // is a single extra reload, never an infinite loop, since there's no
    // way to guard without storage.
  }
  window.location.reload();
}

export function ChunkReloadGuard() {
  useEffect(() => {
    function handleResourceError(event: Event) {
      const target = event.target;
      if (target instanceof HTMLScriptElement && isStaleNextChunkSrc(target.src)) {
        reloadOnce();
      }
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason as { message?: string; name?: string } | undefined;
      if (looksLikeStaleChunkError(reason?.name) || looksLikeStaleChunkError(reason?.message)) {
        reloadOnce();
      }
    }

    // Resource load errors (e.g. a <script src> 404/500) don't bubble,
    // so this must be a capturing listener.
    window.addEventListener("error", handleResourceError, true);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleResourceError, true);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
