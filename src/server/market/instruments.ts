// Canonical instrument registry for the Yahoo Finance market-data adapter.
//
// Milestone 13: this used to track only 3 indices (via ETF proxy: SPY/
// QQQ/DIA) + 5 stocks. It now covers the FULL Compass asset catalog (see
// src/lib/assets/catalog.ts, the single source of truth for "what assets
// exist") using Yahoo's real index/futures/crypto symbols instead of ETF
// proxies — ^GSPC instead of SPY, GC=F instead of a gold ETF, BTC-USD
// instead of a Bitcoin trust, etc. This file re-derives its ticker map
// from the catalog rather than hardcoding a second list, so the two can
// never drift apart.
//
// Server-only: never import this from a client component. The Yahoo
// ticker strings themselves aren't secret, but keeping the registry (and
// everything that calls Yahoo) server-side is what lets us cache, rate-
// limit, and centralize error handling in one place instead of every
// browser tab hitting Yahoo directly.

import { ASSET_CATALOG, ASSET_CATALOG_ORDER, AssetId } from "@/lib/assets/catalog";

export type MarketInstrumentSlug = AssetId;

export type MarketInstrument = {
  slug: MarketInstrumentSlug;
  /** The exact symbol requested from Yahoo Finance — a real index/futures/crypto symbol, never an ETF proxy. */
  yahooTicker: string;
  displaySymbol: string;
  displayName: string;
  category: "index" | "stock" | "commodity" | "crypto";
};

function buildInstruments(): Record<MarketInstrumentSlug, MarketInstrument> {
  const out = {} as Record<MarketInstrumentSlug, MarketInstrument>;
  for (const slug of ASSET_CATALOG_ORDER) {
    const asset = ASSET_CATALOG[slug];
    out[slug] = {
      slug,
      yahooTicker: asset.yahooSymbol,
      displaySymbol: asset.symbol,
      displayName: asset.name,
      category: asset.category,
    };
  }
  return out;
}

export const MARKET_INSTRUMENTS: Record<MarketInstrumentSlug, MarketInstrument> = buildInstruments();

export const MARKET_INSTRUMENT_SLUGS: MarketInstrumentSlug[] = ASSET_CATALOG_ORDER;

export function isMarketInstrumentSlug(value: string): value is MarketInstrumentSlug {
  return Object.prototype.hasOwnProperty.call(MARKET_INSTRUMENTS, value);
}

export function getInstrument(slug: MarketInstrumentSlug): MarketInstrument {
  return MARKET_INSTRUMENTS[slug];
}
