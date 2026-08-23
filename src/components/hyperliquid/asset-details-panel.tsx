"use client";

// Phase 7 — the technical mapping (CompassFinance asset → underlying →
// Hyperliquid perpetual → API ticker) stays fully available, but never as
// the PRIMARY label anywhere in Markets/Trade/Portfolio. This is the one
// place a user can see it, on demand, when they expand an asset's row or
// the trading page's own Details toggle — shared so both surfaces render
// identically instead of drifting.
//
// Phase 8: for a HIP-3 market (venue "hip3"), this panel is also where
// the required instrument disclosure lives — the deployer sets the
// oracle price for these, a materially different trust model than the
// native dex, and the panel must never let a user come away thinking
// they own the actual stock/index/commodity or hold a traditional
// futures contract.

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
  venue,
  dexFullName,
}: {
  /** Human-readable name, e.g. "Bitcoin" — the SAME string already shown
   * as the primary label elsewhere, repeated here for context. */
  name: string;
  /** The real underlying/index/company, e.g. "Bitcoin", "S&P 500 Index",
   * "Apple Inc." */
  underlying: string;
  /** e.g. "BTC-PERP", "xyz:AAPL" — the raw technical ticker CompassFinance's
   * own API calls, charts, and order execution actually address this
   * market by. Never shown as a primary label anywhere outside this panel. */
  technicalTicker: string;
  /** e.g. "Perpetual" — the kind of instrument actually traded. */
  instrumentType: string;
  /** "native" for the standard/main Hyperliquid dex, "hip3" for a
   * builder-deployed dex — drives the oracle-tracking disclosure, only
   * shown for "hip3". */
  venue: "native" | "hip3";
  /** The HIP-3 dex's own display name ("XYZ") — the "Oracle/deployer"
   * row, only rendered when venue is "hip3". */
  dexFullName: string | null;
}) {
  const { t } = useTranslation();
  const isHip3 = venue === "hip3";
  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px]">
      <Row label={t("market.detailsName")} value={name} />
      <Row label={t("market.detailsUnderlying")} value={underlying} />
      {isHip3 ? <Row label={t("market.detailsPriceTracking")} value={t("market.detailsOracleReferenced")} /> : null}
      <Row label={t("market.detailsTicker")} value={technicalTicker} />
      <Row label={t("market.detailsInstrumentType")} value={instrumentType} />
      <Row
        label={t("market.detailsDataSource")}
        value={isHip3 ? t("market.detailsVenueHip3") : t("market.detailsVenueNative")}
      />
      {isHip3 && dexFullName ? <Row label={t("market.detailsOracleDeployer")} value={dexFullName} /> : null}
      {isHip3 ? (
        <p className="border-t border-border pt-1.5 text-[11px] leading-snug text-ink-faint">
          {t("market.detailsOracleDisclosure")}
        </p>
      ) : null}
    </div>
  );
}
