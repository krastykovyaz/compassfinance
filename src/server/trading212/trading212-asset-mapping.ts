import "server-only";
import { ALL_ASSETS, type AssetId } from "@/lib/assets/catalog";

// Requirement 6: map a Trading 212 instrument to an existing CompassFinance
// asset ("Do not use technical tickers as the primary UI name") — but never
// guess. Trading 212 tickers carry an exchange suffix, e.g. "AAPL_US_EQ",
// "TSLA_US_EQ" — stripping everything from the first underscore recovers
// the bare ticker, which is exactly CompassFinance's own DISPLAY_SYMBOL for
// its handful of individual-stock assets (aapl/nvda/tsla/msft/amzn/googl).
// Anything that doesn't match one of those (an index fund, a foreign
// exchange listing, an asset CompassFinance's 13-entry catalog simply
// doesn't cover) is intentionally left unmapped — the caller preserves the
// raw externalTicker/externalName instead of fabricating a match.

const BARE_TICKER_TO_ASSET_ID: Record<string, AssetId> = Object.fromEntries(
  ALL_ASSETS.filter((asset) => asset.category === "stock").map((asset) => [asset.symbol, asset.id])
);

export function mapTrading212TickerToAssetId(externalTicker: string): AssetId | null {
  const bare = externalTicker.split("_")[0];
  return BARE_TICKER_TO_ASSET_ID[bare] ?? null;
}
