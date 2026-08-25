// Pure matching logic for chunk-reload-guard.tsx, pulled into its own
// .ts file so it's directly unit-testable (this repo's test runner only
// covers .ts files, not .tsx component internals).

// Matches both webpack's classic "ChunkLoadError"/"Loading chunk N
// failed" and Turbopack/ESM dynamic-import failures like "Failed to
// fetch dynamically imported module" — different bundlers, same
// underlying "an old, no-longer-served file" root cause.
const STALE_CHUNK_PATTERN =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i;

export function looksLikeStaleChunkError(message: string | undefined | null): boolean {
  if (!message) return false;
  return STALE_CHUNK_PATTERN.test(message);
}

/** True for a failed <script> load whose src is one of Next.js's own
 * content-hashed static chunk files — the exact failure mode confirmed
 * live (nginx logged a 500 for /_next/static/chunks/<hash>.js after a
 * deploy replaced it) when a tab has been open across a deploy. */
export function isStaleNextChunkSrc(src: string | undefined | null): boolean {
  if (!src) return false;
  return src.includes("/_next/static/") && src.endsWith(".js");
}
