// The list of coins Hyperliquid currently trades as perpetuals — fetched
// live from Hyperliquid's "meta" endpoint, never hardcoded. This is
// deliberately NOT part of src/lib/assets/catalog.ts: that catalog's
// AssetId union is generated from learning-content paths (every entry has
// a lesson, a quiz, an investment-unlock stage), and Hyperliquid perp
// markets have none of that — they're a separate, independent registry.

import { getOrFetch } from "@/server/market/cache";
import { fetchMeta } from "./client";

export type HyperliquidUniverseEntry = {
  coin: string;
  index: number;
  szDecimals: number;
  maxLeverage: number;
};

export type HyperliquidUniverseResult =
  | { status: "ok"; universe: HyperliquidUniverseEntry[] }
  | { status: "unavailable"; reason: string };

const UNIVERSE_CACHE_TTL_MS = 5 * 60_000;

export async function getHyperliquidUniverse(): Promise<HyperliquidUniverseResult> {
  try {
    const universe = await getOrFetch("hl:meta", UNIVERSE_CACHE_TTL_MS, async () => {
      const fetched = await fetchMeta();
      if (!fetched.ok) {
        // Thrown so getOrFetch does not cache the failure — a transient
        // Hyperliquid hiccup shouldn't pin "no markets" for the full TTL.
        throw new Error(fetched.message);
      }
      return fetched.data.universe.map((u, index) => ({
        coin: u.name,
        index,
        szDecimals: u.szDecimals,
        maxLeverage: u.maxLeverage,
      }));
    });
    return { status: "ok", universe };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Hyperliquid market list unavailable";
    return { status: "unavailable", reason };
  }
}

export async function isKnownHyperliquidCoin(coin: string): Promise<boolean> {
  const result = await getHyperliquidUniverse();
  return result.status === "ok" && result.universe.some((u) => u.coin === coin);
}
