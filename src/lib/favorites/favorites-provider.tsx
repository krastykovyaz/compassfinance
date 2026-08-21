"use client";

// Single, shared source of truth for favorites (Milestone 13). Previously
// each screen that wanted to know "is this favorited?" would have needed
// its own fetch to /api/user/favorites — this provider fetches the list
// exactly once per session and every consumer (Overview, Explore, the
// asset detail page, the Watchlist filter) reads from the same context,
// so a favorite toggled in one place is instantly reflected everywhere
// else without a second network round-trip. Backed by the existing
// favorites API/database (src/server/repositories/favorites-repository.ts)
// — this is not a second competing favorites system, just a shared client
// cache in front of the one that already existed.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { applyFavoriteToggle } from "./optimistic";

type FavoritesApiResponse = { favorites: { assetId: string }[] };

export type FavoritesContextValue = {
  isFavorite: (assetId: string) => boolean;
  toggleFavorite: (assetId: string) => Promise<void>;
  favoriteIds: string[];
  loaded: boolean;
  isSignedIn: boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      const t = setTimeout(() => {
        setIds(new Set());
        setLoaded(status !== "loading");
      }, 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    fetch("/api/user/favorites")
      .then((res) => (res.ok ? (res.json() as Promise<FavoritesApiResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setIds(new Set(data.favorites.map((f) => f.assetId)));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const toggleFavorite = useCallback(
    async (assetId: string) => {
      if (status !== "authenticated") {
        // Previously this silently no-opped, which looked like a broken
        // star to anyone tapping it while signed out (most of the rest of
        // Compass works fully signed-out via local progress — see
        // progress-store.tsx — so there was nothing here to signal that
        // favorites specifically need an account). Send them to sign in
        // instead of pretending the tap did nothing.
        router.push("/signin");
        return;
      }
      const wasFavorite = ids.has(assetId);

      // Optimistic update, rolled back below on failure.
      setIds((prev) => applyFavoriteToggle(prev, assetId, !wasFavorite));

      try {
        const res = await fetch(
          wasFavorite ? `/api/user/favorites/${assetId}` : "/api/user/favorites",
          wasFavorite
            ? { method: "DELETE" }
            : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetId }),
              }
        );
        if (!res.ok) throw new Error("favorite sync failed");
      } catch {
        setIds((prev) => applyFavoriteToggle(prev, assetId, wasFavorite));
      }
    },
    [ids, status, router]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      isFavorite: (assetId: string) => ids.has(assetId),
      toggleFavorite,
      favoriteIds: Array.from(ids),
      loaded,
      isSignedIn: status === "authenticated",
    }),
    [ids, toggleFavorite, loaded, status]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return ctx;
}

/**
 * Drop-in replacement for the old per-asset useFavorite(assetId) hook —
 * same {favorited, loaded, toggle, isSignedIn} shape existing call sites
 * already use, just backed by the shared context instead of its own fetch.
 */
export function useFavorite(assetId: string): {
  favorited: boolean;
  loaded: boolean;
  toggle: () => Promise<void>;
  isSignedIn: boolean;
} {
  const { isFavorite, toggleFavorite, loaded, isSignedIn } = useFavorites();
  return {
    favorited: isFavorite(assetId),
    loaded,
    toggle: () => toggleFavorite(assetId),
    isSignedIn,
  };
}
