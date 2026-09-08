import { formatNumber } from "@/lib/utils";

// Requirement 7: CompassFinance's shared formatCurrency() is deliberately
// USD-only (every other money value in this app — paper trading,
// Hyperliquid margin — genuinely IS USD, so hardcoding it there is
// correct, not a bug). Trading 212 is the one real source of non-USD
// money in this app (an account's home currency, or an individual
// position's own listing currency, can be EUR, GBP, etc.), and there is
// no FX/exchange-rate provider anywhere in this codebase — so this
// formatter shows each value in ITS OWN real currency rather than
// silently relabeling it as USD or inventing a converted number.
export function formatTrading212Currency(value: number, currencyCode: string | null): string {
  if (!currencyCode) return formatNumber(value);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Intl doesn't recognize this currency code (malformed data from
    // Trading 212, e.g. a code that isn't real ISO 4217) — still show it
    // explicitly rather than silently dropping or guessing a symbol.
    return `${formatNumber(value)} ${currencyCode}`;
  }
}

// Requirement 16's activity examples always pair a symbol with the ISO
// code ("$500.00 USD", "€450.00 EUR", "£12.50 GBP") — a feed that can mix
// currencies row-to-row is exactly where a bare "$" is genuinely
// ambiguous (USD? CAD? AUD?), so the activity list spells out the real
// code on every amount rather than relying on the symbol alone.
export function formatTrading212CurrencyWithCode(value: number, currencyCode: string | null): string {
  const formatted = formatTrading212Currency(value, currencyCode);
  if (!currencyCode || formatted.endsWith(currencyCode)) return formatted;
  return `${formatted} ${currencyCode}`;
}
