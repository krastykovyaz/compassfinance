import "server-only";
import { ALL_ASSETS, type AssetId } from "@/lib/assets/catalog";

// Maps an IBKR position to an existing CompassFinance asset — but never
// guesses. Priority, per the product requirement:
//   1. IBKR conid (a stable, unambiguous contract identifier)
//   2. security type / exchange / currency
//   3. ticker/symbol
//
// Only priority 3 is actually reachable today: CompassFinance's own asset
// catalog (src/lib/assets/catalog.ts) has no conid registry at all — it's
// keyed by ticker symbol only, same as Trading 212's own mapping
// (trading212-asset-mapping.ts). This function's signature still accepts
// conid/assetClass/currency so a future phase can populate a real conid
// table and upgrade the priority order without changing every call site —
// today, those fields are read only for the SAFETY check below, not for
// an actual conid lookup that doesn't exist yet.
//
// The safety check this function exists to enforce: IBKR positions span
// stocks, options, futures, and other instrument types that can share a
// root SYMBOL with an entirely different, unrelated Compass catalog
// asset (an AAPL option's own description often starts with "AAPL",
// the same string as the underlying stock's own ticker). Trading 212
// never needed this guard — its /equity/portfolio only ever returns
// equities. IBKR's does not make that guarantee, so a symbol match is
// only ever attempted when `assetClass` is exactly "STK" (a plain
// equity) — every other asset class (OPT/FUT/CASH/...) is left
// unmapped, preserving the raw provider identity instead of risking a
// collision with an unrelated stock/index/ETF/crypto asset.

const SYMBOL_TO_ASSET_ID: Record<string, AssetId> = Object.fromEntries(
  ALL_ASSETS.filter((asset) => asset.category === "stock").map((asset) => [asset.symbol, asset.id])
);

export type InteractiveBrokersMappablePosition = {
  conid: string;
  symbol: string | null;
  assetClass: string | null;
  currency: string | null;
};

export function mapInteractiveBrokersPositionToAssetId(position: InteractiveBrokersMappablePosition): AssetId | null {
  if (position.assetClass !== "STK" || !position.symbol) return null;
  return SYMBOL_TO_ASSET_ID[position.symbol] ?? null;
}
