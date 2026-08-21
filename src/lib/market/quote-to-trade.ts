// Small pure helper shared by the asset page (opening a practice position)
// and the position page (closing one). Both need "the current real price,
// or nothing" — never a fake/random price — so this is the one place that
// decides how a QuoteFetchResult becomes (or doesn't become) a number a
// trade can use. Kept separate from any React so it's trivially testable.

import { QuoteFetchResult } from "./market-types";

/**
 * Returns the live price to use for opening/closing a paper position, or
 * null when no real quote is available yet (loading, or Yahoo Finance
 * unavailable). Callers must treat null as "cannot trade right now" — they
 * must never substitute a mock/default/random price in its place.
 */
export function priceFromQuoteResult(result: QuoteFetchResult | undefined | null): number | null {
  if (!result || result.status !== "ok") return null;
  const { price } = result.quote;
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  return price;
}
