// S&P 500 keeps its original, dedicated lesson route (see content/sp500.ts
// for why); every other asset with content runs through the generic
// /learn/[assetId] engine. Centralized here so the mapping only needs to
// be right in one place — before Milestone 8.1 this was duplicated across
// learn/page.tsx, asset-unlock-card.tsx, and (now) asset/[slug]/page.tsx.
export function getLessonHref(assetId: string): string {
  return assetId === "sp500" ? "/learn/indices/sp500" : `/learn/${assetId}`;
}
