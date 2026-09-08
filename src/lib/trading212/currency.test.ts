import { describe, expect, it } from "vitest";
import { formatTrading212Currency, formatTrading212CurrencyWithCode } from "./currency";

describe("formatTrading212Currency", () => {
  it("formats USD with a dollar sign", () => {
    expect(formatTrading212Currency(181.42, "USD")).toBe("$181.42");
  });

  it("formats EUR with a euro sign — never mislabels it as USD", () => {
    const result = formatTrading212Currency(150, "EUR");
    expect(result).toContain("150.00");
    expect(result).toMatch(/€/);
    expect(result).not.toContain("$");
  });

  it("formats GBP distinctly from USD and EUR", () => {
    const result = formatTrading212Currency(100, "GBP");
    expect(result).toMatch(/£/);
  });

  it("falls back to a bare number when no currency code is available, rather than guessing", () => {
    expect(formatTrading212Currency(50, null)).toBe("50.00");
  });

  it("shows the raw currency code alongside the number when Intl doesn't recognize it, rather than dropping it", () => {
    expect(formatTrading212Currency(10, "NOTACODE")).toBe("10.00 NOTACODE");
  });
});

describe("formatTrading212CurrencyWithCode", () => {
  it("pairs the symbol with the real ISO code — never ambiguous about which currency a bare symbol means", () => {
    expect(formatTrading212CurrencyWithCode(500, "USD")).toBe("$500.00 USD");
    expect(formatTrading212CurrencyWithCode(450, "EUR")).toBe("€450.00 EUR");
    expect(formatTrading212CurrencyWithCode(12.5, "GBP")).toBe("£12.50 GBP");
  });

  it("doesn't double up the code when the fallback path already appended it", () => {
    expect(formatTrading212CurrencyWithCode(10, "NOTACODE")).toBe("10.00 NOTACODE");
  });

  it("falls back to a bare number with no currency at all when none is available", () => {
    expect(formatTrading212CurrencyWithCode(10, null)).toBe("10.00");
  });
});
