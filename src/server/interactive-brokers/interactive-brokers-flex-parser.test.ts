import { describe, expect, it } from "vitest";
import { parseFlexDate, parseFlexReport } from "./interactive-brokers-flex-parser";
import { decodeXmlEntities, firstElementText, scanElements } from "./interactive-brokers-flex-xml";
import { FLEX_REPORT_XML } from "./__fixtures__/flex-report";

describe("flex xml scanner", () => {
  it("reads attributes from self-closing and open tags in document order", () => {
    const elements = scanElements('<A x="1" y=\'two\'><B z="3"/></A>');
    expect(elements).toEqual([
      { name: "A", attrs: { x: "1", y: "two" } },
      { name: "B", attrs: { z: "3" } },
    ]);
  });

  it("decodes the predefined entities and numeric references, and leaves anything else alone", () => {
    expect(decodeXmlEntities("A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos; &#65; &#x42;")).toBe(`A & B <C> "D" 'E' A B`);
    expect(decodeXmlEntities("&unknown; &#99999999999;")).toBe("&unknown; &#99999999999;");
  });

  it("never expands a declared entity (no DOCTYPE support: this cannot be used for entity bombs)", () => {
    const xml = '<!DOCTYPE x [<!ENTITY a "AAAA">]><R v="&a;"/>';
    expect(scanElements(xml)).toEqual([{ name: "R", attrs: { v: "&a;" } }]);
  });

  it("stays fast on a malformed multi-megabyte tag (no pathological backtracking)", () => {
    const hostile = "<A " + 'x="1" '.repeat(300_000);
    const started = performance.now();
    scanElements(hostile);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("reads the text of the status envelope", () => {
    expect(firstElementText("<R><Status>Success</Status><ReferenceCode> 42 </ReferenceCode></R>", "ReferenceCode")).toBe("42");
    expect(firstElementText("<R/>", "Status")).toBeNull();
  });
});

describe("parseFlexDate", () => {
  it("reads the formats Flex can be configured to emit", () => {
    expect(parseFlexDate("20260105;093000")?.toISOString()).toBe("2026-01-05T09:30:00.000Z");
    expect(parseFlexDate("20260105")?.toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect(parseFlexDate("2026-01-05 09:30:00")?.toISOString()).toBe("2026-01-05T09:30:00.000Z");
    expect(parseFlexDate("2026-01-05,09:30:00")?.toISOString()).toBe("2026-01-05T09:30:00.000Z");
  });

  it("returns null for anything else rather than inventing a date", () => {
    expect(parseFlexDate(undefined)).toBeNull();
    expect(parseFlexDate("")).toBeNull();
    expect(parseFlexDate("yesterday")).toBeNull();
    expect(parseFlexDate("20261399")).toBeNull();
  });
});

describe("parseFlexReport", () => {
  const result = parseFlexReport(FLEX_REPORT_XML);
  if (!result.ok) throw new Error("fixture must parse");
  const report = result.report;

  it("reads the account, the period and the latest net asset value and cash", () => {
    expect(report.accountId).toBe("U1234567");
    expect(report.accountCurrency).toBe("EUR");
    expect(report.accountType).toBe("Individual");
    expect(report.fromDate).toBe("20251007");
    expect(report.toDate).toBe("20261007");
    expect(report.reportDate).toBe("20261007"); // the later of the two report dates
    expect(report.totalValue).toBe(10624);
    expect(report.cash).toBe(1500.25);
  });

  it("keeps summary-level, in-scope, non-zero positions only, signed, with entities decoded", () => {
    expect(report.positions.map((p) => p.symbol)).toEqual(["AAPL", "TSLA"]); // no LOT row, no zero row, no other account
    const tsla = report.positions.find((p) => p.symbol === "TSLA")!;
    expect(tsla.quantity).toBe(-5); // a short stays negative
    expect(tsla.description).toBe("TESLA & CO");
    const aapl = report.positions[0];
    expect(aapl).toMatchObject({ conid: "265598", assetClass: "STK", currency: "USD", quantity: 10, markPrice: 200, costBasisPrice: 150, unrealizedPnl: 500, fxRateToBase: 0.92 });
  });

  it("keeps executions only and stores sells as a positive quantity with the side", () => {
    expect(report.trades.map((t) => t.externalId)).toEqual(["flex-trade-111", "flex-trade-112"]); // the ORDER-level row is skipped
    expect(report.trades[1]).toMatchObject({ side: "SELL", quantity: 4, price: 190, value: -760 });
    expect(report.trades[0].occurredAt.toISOString()).toBe("2026-01-05T09:30:00.000Z");
  });

  it("keeps detail-level cash transactions with IBKR's own type wording, and skips summary rows", () => {
    expect(report.cashTransactions.map((c) => [c.externalId, c.type, c.amount])).toEqual([
      ["flex-cash-900", "Dividends", 2.4],
      ["flex-cash-901", "Deposits/Withdrawals", 1000],
      ["flex-cash-902", "Other Fees", -1],
    ]);
  });

  it("signs a transfer by its direction", () => {
    expect(report.transfers).toHaveLength(1);
    expect(report.transfers[0]).toMatchObject({ externalId: "flex-transfer-950", type: "INTERNAL", amount: -200 });
  });

  it("never carries personal fields from Account Information, even when the query included them", () => {
    const text = JSON.stringify(report);
    for (const secret of ["Jane", "Doe", "Example Road", "Dublin", "D01 X000", "19900101", "jane@example.com"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("degrades a missing attribute to null instead of failing the report", () => {
    const xml = '<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1"><OpenPositions><OpenPosition accountId="U1" conid="5" position="2" /></OpenPositions></FlexStatement></FlexStatements></FlexQueryResponse>';
    const parsed = parseFlexReport(xml);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.report.positions[0]).toMatchObject({ conid: "5", quantity: 2, markPrice: null, symbol: null });
      expect(parsed.report.totalValue).toBeNull();
    }
  });

  it("falls back to the cash report's base summary when the net asset value section is missing", () => {
    const xml = '<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1"><CashReportCurrency accountId="U1" currency="BASE_SUMMARY" endingCash="77.5" /></FlexStatement></FlexStatements></FlexQueryResponse>';
    const parsed = parseFlexReport(xml);
    expect(parsed.ok && parsed.report.cash).toBe(77.5);
  });

  it("rejects text that isn't a Flex report", () => {
    expect(parseFlexReport("<html><body>Maintenance</body></html>")).toEqual({ ok: false, message: expect.any(String) });
    expect(parseFlexReport("")).toEqual({ ok: false, message: expect.any(String) });
  });
});
