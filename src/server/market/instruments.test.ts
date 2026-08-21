import { describe, expect, it } from "vitest";
import { ASSET_CATALOG_ORDER } from "@/lib/assets/catalog";
import { getInstrument, isMarketInstrumentSlug, MARKET_INSTRUMENT_SLUGS } from "./instruments";

describe("market instrument registry", () => {
  it("has a Yahoo Finance mapping for every one of the 13 canonical catalog assets", () => {
    expect(MARKET_INSTRUMENT_SLUGS).toHaveLength(13);
    for (const id of ASSET_CATALOG_ORDER) {
      expect(isMarketInstrumentSlug(id)).toBe(true);
      const instrument = getInstrument(id);
      expect(instrument.yahooTicker).toBeTruthy();
    }
  });

  it("uses the real Yahoo index symbols, not ETF proxies", () => {
    expect(getInstrument("sp500").yahooTicker).toBe("^GSPC");
    expect(getInstrument("nasdaq").yahooTicker).toBe("^NDX");
  });

  it("uses direct tickers for stocks", () => {
    expect(getInstrument("aapl").yahooTicker).toBe("AAPL");
    expect(getInstrument("nvda").yahooTicker).toBe("NVDA");
    expect(getInstrument("tsla").yahooTicker).toBe("TSLA");
    expect(getInstrument("msft").yahooTicker).toBe("MSFT");
    expect(getInstrument("amzn").yahooTicker).toBe("AMZN");
    expect(getInstrument("googl").yahooTicker).toBe("GOOGL");
    expect(getInstrument("meta").yahooTicker).toBe("META");
  });

  it("uses futures symbols for commodities", () => {
    expect(getInstrument("gold").yahooTicker).toBe("GC=F");
    expect(getInstrument("brent-oil").yahooTicker).toBe("BZ=F");
  });

  it("uses -USD symbols for crypto", () => {
    expect(getInstrument("btc").yahooTicker).toBe("BTC-USD");
    expect(getInstrument("eth").yahooTicker).toBe("ETH-USD");
  });

  it("rejects a symbol outside the canonical catalog", () => {
    expect(isMarketInstrumentSlug("dow")).toBe(false);
    expect(isMarketInstrumentSlug("doge")).toBe(false);
  });

  it("every instrument's category matches its catalog category", () => {
    for (const id of ASSET_CATALOG_ORDER) {
      const instrument = getInstrument(id);
      expect(["index", "stock", "commodity", "crypto"]).toContain(instrument.category);
    }
  });
});
