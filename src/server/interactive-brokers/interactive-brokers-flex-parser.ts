import { scanElements, type XmlElement } from "./interactive-brokers-flex-xml";

// Turns the XML of one Flex "Activity" report into plain typed rows. Only
// the attributes this app uses are read; everything else in the report is
// ignored on purpose. In particular the Account Information section can
// carry a name, address, date of birth and email depending on how the
// query was set up: none of those attributes is ever read, copied or
// stored here, so even a query that includes them exposes nothing to the
// rest of the app.
//
// Written against IBKR's documented Flex element and attribute names. Every
// field is optional on purpose: a missing or renamed attribute degrades to
// null for that one value instead of failing the whole report.

export type FlexPosition = {
  conid: string;
  symbol: string | null;
  description: string | null;
  assetClass: string | null;
  currency: string | null;
  quantity: number;
  markPrice: number | null;
  costBasisPrice: number | null;
  unrealizedPnl: number | null;
  fxRateToBase: number | null;
  multiplier: number | null;
  strike: number | null;
  expiry: string | null;
  underlyingConid: string | null;
};

export type FlexTrade = {
  externalId: string;
  conid: string | null;
  symbol: string | null;
  description: string | null;
  assetClass: string | null;
  currency: string | null;
  side: "BUY" | "SELL";
  quantity: number;
  price: number | null;
  value: number | null;
  occurredAt: Date;
};

export type FlexCashTransaction = {
  externalId: string;
  type: string;
  conid: string | null;
  symbol: string | null;
  description: string | null;
  assetClass: string | null;
  currency: string | null;
  amount: number;
  occurredAt: Date;
};

export type FlexTransfer = {
  externalId: string;
  type: string;
  symbol: string | null;
  description: string | null;
  assetClass: string | null;
  conid: string | null;
  currency: string | null;
  quantity: number | null;
  amount: number;
  occurredAt: Date;
};

export type FlexReport = {
  accountId: string | null;
  accountCurrency: string | null;
  accountType: string | null;
  fromDate: string | null;
  toDate: string | null;
  reportDate: string | null;
  totalValue: number | null;
  cash: number | null;
  positions: FlexPosition[];
  trades: FlexTrade[];
  cashTransactions: FlexCashTransaction[];
  transfers: FlexTransfer[];
};

export type FlexParseResult = { ok: true; report: FlexReport } | { ok: false; message: string };

function str(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function num(value: string | undefined): number | null {
  const s = str(value);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Accepts the formats Flex can be configured to emit: 20260105,
 * 20260105;093000, 2026-01-05, 2026-01-05 09:30:00, 2026-01-05,09:30:00.
 * Flex timestamps carry no zone; they are read as UTC, which can shift a
 * row by a few hours (it never changes its day by more than one), enough
 * for ordering. */
export function parseFlexDate(value: string | undefined): Date | null {
  const s = str(value);
  if (s === null) return null;
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:[;,\sT]+(\d{2}):?(\d{2})(?::?(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m;
  const parts = [Number(y), Number(mo), Number(d), Number(h ?? 0), Number(mi ?? 0), Number(sec ?? 0)];
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
  // Date.UTC rolls an impossible value (month 13, day 99, hour 25) forward
  // into a valid-looking later date, which would misplace a row on the
  // timeline. Accept only a date that reads back as the same components.
  const roundTrips =
    date.getUTCFullYear() === parts[0] &&
    date.getUTCMonth() === parts[1] - 1 &&
    date.getUTCDate() === parts[2] &&
    date.getUTCHours() === parts[3] &&
    date.getUTCMinutes() === parts[4] &&
    date.getUTCSeconds() === parts[5];
  return roundTrips ? date : null;
}

function isSummaryLevel(attrs: Record<string, string>): boolean {
  const level = str(attrs.levelOfDetail);
  return level === null || level.toUpperCase() === "SUMMARY";
}

function isDetailLevel(attrs: Record<string, string>, wanted: string): boolean {
  const level = str(attrs.levelOfDetail);
  return level === null || level.toUpperCase() === wanted;
}

function pickAccountScope(elements: XmlElement[]): string | null {
  const statement = elements.find((e) => e.name === "FlexStatement");
  const info = elements.find((e) => e.name === "AccountInformation");
  return str(statement?.attrs.accountId) ?? str(info?.attrs.accountId);
}

export function parseFlexReport(xml: string): FlexParseResult {
  const elements = scanElements(xml);
  const hasReport = elements.some((e) => e.name === "FlexQueryResponse" || e.name === "FlexStatement");
  if (!hasReport) return { ok: false, message: "The report didn't contain a Flex statement." };

  const statement = elements.find((e) => e.name === "FlexStatement");
  const info = elements.find((e) => e.name === "AccountInformation");
  const accountId = pickAccountScope(elements);

  // A query can cover several accounts; this connection is for one. Rows
  // from any other account are dropped rather than mixed in.
  const inScope = (e: XmlElement) => {
    const rowAccount = str(e.attrs.accountId);
    return accountId === null || rowAccount === null || rowAccount === accountId;
  };

  let reportDate: string | null = null;
  let totalValue: number | null = null;
  let navCash: number | null = null;
  for (const e of elements) {
    if (e.name !== "EquitySummaryByReportDateInBase" || !inScope(e)) continue;
    const date = str(e.attrs.reportDate);
    if (date !== null && (reportDate === null || date > reportDate)) {
      reportDate = date;
      totalValue = num(e.attrs.total);
      navCash = num(e.attrs.cash);
    }
  }
  // Cash falls back to the base-currency summary row of the Cash Report.
  let cash = navCash;
  if (cash === null) {
    const base = elements.find((e) => e.name === "CashReportCurrency" && inScope(e) && str(e.attrs.currency) === "BASE_SUMMARY");
    cash = num(base?.attrs.endingCash);
  }

  const positionsByConid = new Map<string, FlexPosition>();
  for (const e of elements) {
    if (e.name !== "OpenPosition" || !inScope(e) || !isSummaryLevel(e.attrs)) continue;
    const conid = str(e.attrs.conid);
    const quantity = num(e.attrs.position);
    if (conid === null || quantity === null || quantity === 0) continue;
    positionsByConid.set(conid, {
      conid,
      symbol: str(e.attrs.symbol),
      description: str(e.attrs.description),
      assetClass: str(e.attrs.assetCategory),
      currency: str(e.attrs.currency),
      quantity,
      markPrice: num(e.attrs.markPrice),
      costBasisPrice: num(e.attrs.costBasisPrice),
      unrealizedPnl: num(e.attrs.fifoPnlUnrealized),
      fxRateToBase: num(e.attrs.fxRateToBase),
      multiplier: num(e.attrs.multiplier),
      strike: num(e.attrs.strike),
      expiry: str(e.attrs.expiry),
      underlyingConid: str(e.attrs.underlyingConid),
    });
  }

  const trades: FlexTrade[] = [];
  for (const e of elements) {
    if (e.name !== "Trade" || !inScope(e) || !isDetailLevel(e.attrs, "EXECUTION")) continue;
    const id = str(e.attrs.tradeID) ?? str(e.attrs.transactionID);
    const buySell = str(e.attrs.buySell)?.toUpperCase();
    const quantity = num(e.attrs.quantity);
    const when = parseFlexDate(e.attrs.dateTime) ?? parseFlexDate(e.attrs.tradeDate);
    if (id === null || quantity === null || when === null) continue;
    const side: "BUY" | "SELL" = buySell === "SELL" ? "SELL" : buySell === "BUY" ? "BUY" : quantity < 0 ? "SELL" : "BUY";
    trades.push({
      externalId: `flex-trade-${id}`,
      conid: str(e.attrs.conid),
      symbol: str(e.attrs.symbol),
      description: str(e.attrs.description),
      assetClass: str(e.attrs.assetCategory),
      currency: str(e.attrs.currency),
      side,
      quantity: Math.abs(quantity),
      price: num(e.attrs.tradePrice),
      value: num(e.attrs.tradeMoney),
      occurredAt: when,
    });
  }

  const cashTransactions: FlexCashTransaction[] = [];
  for (const e of elements) {
    if (e.name !== "CashTransaction" || !inScope(e) || !isDetailLevel(e.attrs, "DETAIL")) continue;
    const id = str(e.attrs.transactionID);
    const type = str(e.attrs.type);
    const amount = num(e.attrs.amount);
    const when = parseFlexDate(e.attrs.dateTime) ?? parseFlexDate(e.attrs.reportDate);
    if (id === null || type === null || amount === null || when === null) continue;
    cashTransactions.push({
      externalId: `flex-cash-${id}`,
      type,
      conid: str(e.attrs.conid),
      symbol: str(e.attrs.symbol),
      description: str(e.attrs.description),
      assetClass: str(e.attrs.assetCategory),
      currency: str(e.attrs.currency),
      amount,
      occurredAt: when,
    });
  }

  const transfers: FlexTransfer[] = [];
  for (const e of elements) {
    if (e.name !== "Transfer" || !inScope(e)) continue;
    const id = str(e.attrs.transactionID);
    const when = parseFlexDate(e.attrs.dateTime) ?? parseFlexDate(e.attrs.date);
    if (id === null || when === null) continue;
    const direction = str(e.attrs.direction)?.toUpperCase();
    const magnitude = Math.abs(num(e.attrs.cashTransfer) ?? num(e.attrs.positionAmount) ?? 0);
    transfers.push({
      externalId: `flex-transfer-${id}`,
      type: str(e.attrs.type) ?? "Transfer",
      symbol: str(e.attrs.symbol),
      description: str(e.attrs.description),
      assetClass: str(e.attrs.assetCategory),
      conid: str(e.attrs.conid),
      currency: str(e.attrs.currency),
      quantity: num(e.attrs.quantity),
      amount: direction === "OUT" ? -magnitude : magnitude,
      occurredAt: when,
    });
  }

  return {
    ok: true,
    report: {
      accountId,
      accountCurrency: str(info?.attrs.currency),
      accountType: str(info?.attrs.accountType),
      fromDate: str(statement?.attrs.fromDate),
      toDate: str(statement?.attrs.toDate),
      reportDate,
      totalValue,
      cash,
      positions: [...positionsByConid.values()],
      trades,
      cashTransactions,
      transfers,
    },
  };
}
