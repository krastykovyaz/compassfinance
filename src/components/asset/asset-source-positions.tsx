"use client";

import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { formatCurrency, cn } from "@/lib/utils";
import { formatTrading212Currency } from "@/lib/trading212/currency";
import type { AssetId } from "@/lib/assets/catalog";
import { usePosition } from "@/lib/trading/paper-account-provider";
import { useHyperliquidAccount, useHyperliquidDexAccount } from "@/lib/hyperliquid/hyperliquid-account-provider";
import { getHyperliquidCoinForAsset, getHip3DexName } from "@/lib/hyperliquid/asset-mapping";
import { useTrading212Portfolio } from "@/lib/trading212/use-trading212-portfolio";
import {
  normalizePaperHolding,
  normalizeHyperliquidPosition,
  normalizeTrading212Position,
  type SourcedPosition,
} from "@/lib/portfolio/portfolio-sources";

// Requirement 3/4 (Phase 3): for one CompassFinance asset, show what the
// user actually holds in EACH source side by side — never summed into one
// number. Renders nothing at all when none of the three sources has a
// position here, so an asset the user has never touched shows no trace of
// this section (same convention as the Trading 212 activity card below
// it on the asset page).
export function AssetSourcePositions({ assetId }: { assetId: AssetId }) {
  const { t } = useTranslation();

  const paperPosition = usePosition(assetId);

  // Which Hyperliquid account to even ask depends on whether this asset
  // trades on the native dex (btc/eth) or a HIP-3 dex like "xyz" — these
  // are two genuinely separate isolated margin pools (see
  // asset-mapping.ts's own header comment), never one combined query.
  const hyperliquidCoin = getHyperliquidCoinForAsset(assetId);
  const hip3Dex = hyperliquidCoin ? getHip3DexName(hyperliquidCoin) : null;
  const mainAccount = useHyperliquidAccount();
  const dexAccount = useHyperliquidDexAccount(hip3Dex);
  const hyperliquidSnapshot = hip3Dex ? dexAccount.snapshot : mainAccount.snapshot;
  const hyperliquidPosition =
    hyperliquidCoin && hyperliquidSnapshot
      ? (hyperliquidSnapshot.positions.find((p) => p.coin === hyperliquidCoin) ?? null)
      : null;

  const trading212State = useTrading212Portfolio();
  const trading212Portfolio = trading212State.stage === "loaded" ? trading212State.portfolio : null;
  const trading212Position = trading212Portfolio
    ? (trading212Portfolio.positions.find((p) => p.compassAssetId === assetId) ?? null)
    : null;

  const sources: SourcedPosition[] = [
    ...(trading212Position && trading212Portfolio
      ? [normalizeTrading212Position(trading212Position, trading212Portfolio.lastSyncAt)]
      : []),
    ...(hyperliquidPosition ? [normalizeHyperliquidPosition(hyperliquidPosition)] : []),
    ...(paperPosition ? [normalizePaperHolding(paperPosition)] : []),
  ];

  if (sources.length === 0) return null;

  const SOURCE_LABEL: Record<SourcedPosition["source"], string> = {
    trading212: t("trading212.source"),
    hyperliquid: t("portfolioSources.hyperliquidLabel"),
    paper: t("explore.paperTrading"),
  };

  return (
    <Card>
      <h2 className="text-[15px] font-semibold text-ink">{t("portfolioSources.yourPositions")}</h2>
      <div className="mt-2 divide-y divide-border">
        {sources.map((position) => {
          const formatValue = (value: number) =>
            position.source === "trading212" ? formatTrading212Currency(value, position.currency) : formatCurrency(value);
          return (
            <div key={position.source} className="py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                {SOURCE_LABEL[position.source]}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[13px] text-ink-muted">
                  {position.quantity} {t("trading212.quantity")}
                  {position.technicalTicker ? ` · ${position.technicalTicker}` : ""}
                </p>
                <div className="text-right">
                  <p className="text-[13px] font-medium text-ink">
                    {position.marketValue != null ? formatValue(position.marketValue) : t("trading212.marketValueUnavailable")}
                  </p>
                  {position.unrealizedPnl != null ? (
                    <p
                      className={cn(
                        "text-[11px] font-medium",
                        position.unrealizedPnl >= 0 ? "text-positive" : "text-negative"
                      )}
                    >
                      {position.unrealizedPnl >= 0 ? "+" : ""}
                      {formatValue(position.unrealizedPnl)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
