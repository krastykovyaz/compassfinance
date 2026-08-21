import { Holding } from "@/lib/mock-data";
import { PaperAccountView } from "./types";

/**
 * Maps the real paper-trading account's positions into the existing
 * `Holding` shape `HoldingsList` renders — shared by Home and Portfolio
 * so there's one mapping, not two copies that could drift.
 */
export function accountToHoldings(account: PaperAccountView | null): Holding[] {
  return (account?.positions ?? []).map((p) => ({
    id: p.assetId,
    slug: p.assetId,
    name: p.name,
    symbol: p.symbol,
    shares: p.quantity,
    value: p.marketValue ?? 0,
    changePct: p.unrealizedPnlPercent ?? 0,
    colorKey: "slate" as const,
  }));
}
