// The canonical Compass asset catalog. This is the ONE place that defines
// "what assets exist" — Overview, Explore, favorites, the asset detail
// page, charts, and paper trading all derive from this instead of keeping
// their own asset lists (see the Milestone 13 requirement: no duplicate
// asset catalogs).
//
// The 13 ids/categories here are NOT invented — they're read from
// ASSET_LEARNING_PATH_ORDER / ALL_ASSET_LEARNING_PATHS in
// src/lib/learning/content/index.ts, which is Compass's existing,
// pre-Milestone-13 canonical list of learning assets. This file adds only
// what that registry doesn't already carry: a display symbol, a UI
// colorKey, and the Yahoo Finance symbol used to fetch real market data
// (see src/server/market/instruments.ts, which is keyed by these same
// ids).

import { ALL_ASSET_LEARNING_PATHS, ASSET_LEARNING_PATH_ORDER } from "@/lib/learning/content";
import type { AssetContentCategory } from "@/lib/learning/content/types";

export type AssetCategory = AssetContentCategory; // "index" | "stock" | "commodity" | "crypto"

export type AssetId =
  | "sp500"
  | "nasdaq"
  | "aapl"
  | "nvda"
  | "tsla"
  | "msft"
  | "amzn"
  | "googl"
  | "meta"
  | "gold"
  | "brent-oil"
  | "btc"
  | "eth";

export type ColorKey =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "teal"
  | "rose"
  | "slate";

export type AssetCatalogEntry = {
  id: AssetId;
  slug: AssetId;
  name: string;
  /** Display ticker, e.g. "SPX", "AAPL", "BTC". */
  symbol: string;
  category: AssetCategory;
  colorKey: ColorKey;
  /**
   * The exact symbol requested from Yahoo Finance — real index/futures/
   * crypto symbols (^GSPC, GC=F, BTC-USD, ...), never an ETF proxy. See
   * src/server/market/instruments.ts, which is the server-only file that
   * actually calls Yahoo with this value.
   */
  yahooSymbol: string;
};

const DISPLAY_NAME: Record<AssetId, string> = {
  sp500: "S&P 500",
  nasdaq: "Nasdaq 100",
  aapl: "Apple Inc.",
  nvda: "NVIDIA Corp.",
  tsla: "Tesla Inc.",
  msft: "Microsoft Corp.",
  amzn: "Amazon.com Inc.",
  googl: "Alphabet Inc. (Google)",
  meta: "Meta Platforms Inc.",
  gold: "Gold",
  "brent-oil": "Brent Crude Oil",
  btc: "Bitcoin",
  eth: "Ethereum",
};

const DISPLAY_SYMBOL: Record<AssetId, string> = {
  sp500: "SPX",
  nasdaq: "NDX",
  aapl: "AAPL",
  nvda: "NVDA",
  tsla: "TSLA",
  msft: "MSFT",
  amzn: "AMZN",
  googl: "GOOGL",
  meta: "META",
  gold: "GOLD",
  "brent-oil": "BRENT",
  btc: "BTC",
  eth: "ETH",
};

const YAHOO_SYMBOL: Record<AssetId, string> = {
  sp500: "^GSPC",
  nasdaq: "^NDX",
  aapl: "AAPL",
  nvda: "NVDA",
  tsla: "TSLA",
  msft: "MSFT",
  amzn: "AMZN",
  googl: "GOOGL",
  meta: "META",
  gold: "GC=F",
  "brent-oil": "BZ=F",
  btc: "BTC-USD",
  eth: "ETH-USD",
};

const COLOR_KEY: Record<AssetId, ColorKey> = {
  sp500: "blue",
  nasdaq: "purple",
  aapl: "slate",
  nvda: "green",
  tsla: "rose",
  msft: "blue",
  amzn: "orange",
  googl: "teal",
  meta: "blue",
  gold: "orange",
  "brent-oil": "slate",
  btc: "orange",
  eth: "purple",
};

function buildCatalog(): Record<AssetId, AssetCatalogEntry> {
  const entries = {} as Record<AssetId, AssetCatalogEntry>;
  for (const id of ASSET_LEARNING_PATH_ORDER as AssetId[]) {
    const path = ALL_ASSET_LEARNING_PATHS[id];
    entries[id] = {
      id,
      slug: id,
      name: DISPLAY_NAME[id],
      symbol: DISPLAY_SYMBOL[id],
      category: path.category,
      colorKey: COLOR_KEY[id],
      yahooSymbol: YAHOO_SYMBOL[id],
    };
  }
  return entries;
}

export const ASSET_CATALOG: Record<AssetId, AssetCatalogEntry> = buildCatalog();

/** Stable display order — same order the learning catalog already uses. */
export const ASSET_CATALOG_ORDER: AssetId[] = ASSET_LEARNING_PATH_ORDER as AssetId[];

export const ALL_ASSETS: AssetCatalogEntry[] = ASSET_CATALOG_ORDER.map((id) => ASSET_CATALOG[id]);

export function isAssetId(value: string): value is AssetId {
  return Object.prototype.hasOwnProperty.call(ASSET_CATALOG, value);
}

export function getAsset(id: string): AssetCatalogEntry | undefined {
  return isAssetId(id) ? ASSET_CATALOG[id] : undefined;
}

export function assetsByCategory(category: AssetCategory): AssetCatalogEntry[] {
  return ALL_ASSETS.filter((a) => a.category === category);
}
