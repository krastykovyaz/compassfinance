// The list of coins Hyperliquid currently trades as perpetuals — fetched
// live from Hyperliquid's "meta" endpoint, never hardcoded. This is
// deliberately NOT part of src/lib/assets/catalog.ts: that catalog's
// AssetId union is generated from learning-content paths (every entry has
// a lesson, a quiz, an investment-unlock stage), and Hyperliquid perp
// markets have none of that — they're a separate, independent registry.
//
// Phase 8: also covers builder-deployed (HIP-3) perp dexes, not just the
// native/main one — see asset-mapping.ts's getConfiguredHip3DexNames for
// exactly which dexes that means today ("xyz" only).

import { getOrFetch } from "@/server/market/cache";
import { fetchMeta, fetchPerpDexs, fetchSpotMeta } from "./client";
import { getConfiguredHip3DexNames } from "@/lib/hyperliquid/asset-mapping";

export type HyperliquidUniverseEntry = {
  coin: string;
  /** The exact numeric id Hyperliquid's order/leverage actions expect in
   * their `a`/`asset` field — a plain universe index for the native dex,
   * or 100000 + perp_dex_index*10000 + index_in_meta for a HIP-3 dex (see
   * Hyperliquid's own asset-id docs). Computed fresh every fetch, never
   * hardcoded, so it stays correct even if a dex's universe is reordered. */
  index: number;
  szDecimals: number;
  maxLeverage: number;
  venue: "native" | "hip3";
  /** HIP-3 dex short name ("xyz"), or null for the native dex. */
  dex: string | null;
};

export type HyperliquidUniverseResult =
  | { status: "ok"; universe: HyperliquidUniverseEntry[] }
  | { status: "unavailable"; reason: string };

const UNIVERSE_CACHE_TTL_MS = 5 * 60_000;

/** Where a given HIP-3 dex sits in Hyperliquid's own perpDexs list — the
 * "perp_dex_index" its asset-id formula needs. The main/default dex's own
 * null placeholder counts toward this position (verified against
 * Hyperliquid's docs: "xyz" at position 1 in a [null, xyz, ...] list maps
 * to real, live-observed asset ids like 110001+). Cached like the rest of
 * this file's market metadata; returns null (not thrown) for a dex this
 * Hyperliquid deployment doesn't currently know about, so a transient or
 * removed dex degrades that one dex's markets rather than the whole app. */
export async function getHyperliquidPerpDexIndex(dexName: string): Promise<number | null> {
  try {
    const list = await getOrFetch("hl:perpDexs", UNIVERSE_CACHE_TTL_MS, async () => {
      const fetched = await fetchPerpDexs();
      if (!fetched.ok) throw new Error(fetched.message);
      return fetched.data;
    });
    const idx = list.findIndex((d) => d !== null && d.name === dexName);
    return idx === -1 ? null : idx;
  } catch {
    return null;
  }
}

/** USDC's real on-chain tokenId, in the "NAME:tokenId" format Hyperliquid's
 * sendAsset action requires for its `token` field — DIFFERENT between
 * mainnet and testnet (verified live), so this must always be resolved
 * fresh from spotMeta, never hardcoded as a constant. Returns null (not
 * thrown) on any failure — the one caller (hyperliquid-dex-transfer
 * action building, via the API route) treats that as "can't build a
 * transfer right now" rather than crashing unrelated requests. */
export async function getUsdcTokenId(): Promise<string | null> {
  try {
    return await getOrFetch("hl:usdcTokenId", UNIVERSE_CACHE_TTL_MS, async () => {
      const fetched = await fetchSpotMeta();
      if (!fetched.ok) throw new Error(fetched.message);
      const usdc = fetched.data.tokens.find((t) => t.name === "USDC");
      if (!usdc) throw new Error("USDC not found in Hyperliquid spotMeta");
      return `USDC:${usdc.tokenId}`;
    });
  } catch {
    return null;
  }
}

export async function getHyperliquidUniverse(): Promise<HyperliquidUniverseResult> {
  try {
    const universe = await getOrFetch("hl:meta:all", UNIVERSE_CACHE_TTL_MS, async () => {
      const native = await fetchMeta();
      if (!native.ok) {
        // Thrown so getOrFetch does not cache the failure — a transient
        // Hyperliquid hiccup shouldn't pin "no markets" for the full TTL.
        throw new Error(native.message);
      }
      const entries: HyperliquidUniverseEntry[] = native.data.universe.map((u, index) => ({
        coin: u.name,
        index,
        szDecimals: u.szDecimals,
        maxLeverage: u.maxLeverage,
        venue: "native",
        dex: null,
      }));

      // A HIP-3 dex failing to resolve degrades only that dex's assets —
      // native BTC/ETH must never go down because of an "xyz" hiccup.
      for (const dexName of getConfiguredHip3DexNames()) {
        const dexIndex = await getHyperliquidPerpDexIndex(dexName);
        if (dexIndex === null) continue;
        const dexMeta = await fetchMeta(dexName);
        if (!dexMeta.ok) continue;
        dexMeta.data.universe.forEach((u, i) => {
          entries.push({
            coin: u.name, // already the full "xyz:AAPL"-style identifier
            index: 100000 + dexIndex * 10000 + i,
            szDecimals: u.szDecimals,
            maxLeverage: u.maxLeverage,
            venue: "hip3",
            dex: dexName,
          });
        });
      }

      return entries;
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
