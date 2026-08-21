"use client";

// Milestone 13: this used to be its own fetch-per-asset implementation.
// It's now a thin re-export of the shared FavoritesProvider's useFavorite
// (src/lib/favorites/favorites-provider.tsx) so every screen reads/writes
// the exact same favorites state instead of each maintaining its own copy
// — kept as a re-export (rather than updating every import site) purely
// so this file's existing import path keeps working unchanged.
export { useFavorite } from "@/lib/favorites/favorites-provider";
