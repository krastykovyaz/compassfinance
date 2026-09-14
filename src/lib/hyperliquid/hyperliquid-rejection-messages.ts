// Hyperliquid's own /exchange rejection messages come back as raw English
// API text (e.g. "Order must have minimum value of $10.") — classified
// server-side in service.ts's classifyExchangeResponse, but never
// translated or made friendlier before reaching the UI. That's a real,
// reported problem: a non-English-speaking user sees a raw technical
// string with no clear next step. This is intentionally narrow — it only
// recognizes the ONE rejection message this codebase has direct,
// confirmed evidence for (see service.test.ts's own "minimum order
// value" case) rather than guessing at other Hyperliquid error strings
// that have never actually been observed here. Anything unmatched falls
// back to the raw message, unchanged from prior behavior — never a
// fabricated translation for an error string we don't actually recognize.

export type HyperliquidRejectionDescription = { translationKey: string } | { raw: string };

export function describeHyperliquidRejection(message: string): HyperliquidRejectionDescription {
  if (/minimum (order )?value/i.test(message)) {
    return { translationKey: "perpTrade.rejectedMinimumOrderValue" };
  }
  return { raw: message };
}
