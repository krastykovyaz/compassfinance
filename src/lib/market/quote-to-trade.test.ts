import { describe, expect, it } from "vitest";
import { priceFromQuoteResult } from "./quote-to-trade";
import { QuoteFetchResult } from "./market-types";

const okQuote: QuoteFetchResult = {
  slug: "sp500",
  status: "ok",
  quote: {
    slug: "sp500",
    symbol: "SPX",
    name: "S&P 500",
    price: 5432.1,
    change: 12.3,
    changePercent: 0.23,
    timestamp: 1_700_000_000_000,
  },
};

const unavailableQuote: QuoteFetchResult = {
  slug: "sp500",
  status: "unavailable",
  reason: "Yahoo Finance request failed (500)",
};

describe("priceFromQuoteResult", () => {
  it("returns the live price for an ok quote", () => {
    expect(priceFromQuoteResult(okQuote)).toBe(5432.1);
  });

  it("returns null (never a fake price) when the quote is unavailable", () => {
    expect(priceFromQuoteResult(unavailableQuote)).toBeNull();
  });

  it("returns null when there is no result yet (still loading)", () => {
    expect(priceFromQuoteResult(null)).toBeNull();
    expect(priceFromQuoteResult(undefined)).toBeNull();
  });

  it("returns null rather than a non-finite price, in case of a corrupt payload", () => {
    const corrupt: QuoteFetchResult = {
      ...okQuote,
      quote: { ...okQuote.quote, price: Number.NaN },
    };
    expect(priceFromQuoteResult(corrupt)).toBeNull();
  });
});
