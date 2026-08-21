// Pure Overview filter logic. Deliberately has no React/fetch dependency
// so it's directly unit-testable (see filters.test.ts) — the Overview
// component only ever calls filterAssets(), it never re-derives this
// logic itself.

import { AssetCatalogEntry } from "./catalog";

export type OverviewFilter =
  | "all"
  | "favorites"
  | "portfolio"
  | "stock"
  | "index"
  | "commodity"
  | "crypto";

export const OVERVIEW_FILTERS: OverviewFilter[] = [
  "all",
  "favorites",
  "portfolio",
  "index",
  "stock",
  "commodity",
  "crypto",
];

export type FilterContext = {
  isFavorite: (assetId: string) => boolean;
  isInPortfolio: (assetId: string) => boolean;
};

export function filterAssets(
  assets: AssetCatalogEntry[],
  filter: OverviewFilter,
  ctx: FilterContext
): AssetCatalogEntry[] {
  switch (filter) {
    case "all":
      return assets;
    case "favorites":
      return assets.filter((a) => ctx.isFavorite(a.id));
    case "portfolio":
      return assets.filter((a) => ctx.isInPortfolio(a.id));
    case "stock":
    case "index":
    case "commodity":
    case "crypto":
      return assets.filter((a) => a.category === filter);
    default:
      return assets;
  }
}
