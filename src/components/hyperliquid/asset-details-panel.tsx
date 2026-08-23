"use client";

// Phase 7 — the technical mapping (CompassFinance asset → underlying →
// Hyperliquid perpetual → API ticker) stays fully available, but never as
// the PRIMARY label anywhere in Markets/Trade/Portfolio. This is the one
// place a user can see it, on demand, when they expand an asset's row or
// the trading page's own Details toggle — shared so both surfaces render
// identically instead of drifting.

import { useTranslation } from "@/lib/i18n/locale-provider";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

export function AssetDetailsPanel({
  name,
  underlying,
  technicalTicker,
  instrumentType,
  dataSource,
}: {
  /** Human-readable name, e.g. "Bitcoin" — the SAME string already shown
   * as the primary label elsewhere, repeated here for context. */
  name: string;
  /** The real underlying/index/company, e.g. "Bitcoin", "S&P 500 Index",
   * "Apple Inc." — for a crypto asset this is the same as `name`; for a
   * future equity/index mapping it would name the real company/index. */
  underlying: string;
  /** e.g. "BTC-PERP" — the raw technical ticker CompassFinance's own API
   * calls, charts, and order execution actually address this market by.
   * Never shown as a primary label anywhere outside this panel. */
  technicalTicker: string;
  /** e.g. "Perpetual" — the kind of instrument actually traded. */
  instrumentType: string;
  /** e.g. "Hyperliquid" — where the price/trading data comes from. */
  dataSource: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px]">
      <Row label={t("market.detailsName")} value={name} />
      <Row label={t("market.detailsUnderlying")} value={underlying} />
      <Row label={t("market.detailsTicker")} value={technicalTicker} />
      <Row label={t("market.detailsInstrumentType")} value={instrumentType} />
      <Row label={t("market.detailsDataSource")} value={dataSource} />
    </div>
  );
}
