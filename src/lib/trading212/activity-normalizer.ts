// Provider-neutral activity normalization layer (Phase 4). Pure functions
// only — no fetching, no DB access — so this stays testable without a
// database and importable from both the repository (building the API
// response) and, if ever needed, the client.
//
// Requirement 1's audit: Trading 212's OWN /equity/history/orders
// endpoint returns one object per order that ALREADY bundles the fill
// outcome (status, filledQuantity, fillPrice/filledValue) — it does not
// expose a separate "execution" resource. So there is exactly one stored
// row (BrokerageOrder) per order, and "order" vs "execution" here are two
// DERIVED VIEWS of that one row, never two separately-fetched or
// separately-stored objects — see normalizeOrderRow's own doc comment for
// exactly when each view is (and isn't) emitted, which is also this
// module's answer to Requirement 13 ("don't show three visually
// identical BUY entries for one execution").

import { getAsset } from "@/lib/assets/catalog";

export type Trading212ActivityKind = "order" | "execution" | "dividend" | "deposit" | "withdrawal" | "fee" | "transfer";

export type NormalizedActivityItem = {
  provider: "trading212";
  kind: Trading212ActivityKind;
  /** Stable, unique key for this DERIVED item — e.g. an order that
   * produces both an "order" and "execution" view gets two different
   * ids sharing the same underlying externalId. */
  id: string;
  compassAssetId: string | null;
  /** Resolved display name: the mapped CompassFinance asset's real name,
   * falling back to the provider's own instrument name, then its raw
   * ticker. Null only when this activity has no associated instrument at
   * all (a deposit/withdrawal). */
  assetName: string | null;
  /** The provider's own raw ticker, always preserved regardless of
   * mapping (Requirement 15) — null for account-level events. */
  rawTicker: string | null;
  occurredAt: string; // ISO — always the provider's own timestamp, never sync time
  quantity: number | null;
  /** Per-unit price — real, or (for an execution) mechanically derived
   * from a real aggregate ÷ real quantity. Never estimated from
   * unrelated data. */
  price: number | null;
  /** The real total amount for this event — an execution's fill value,
   * a dividend's paid amount, a transaction's amount. Never a fabricated
   * number. */
  grossAmount: number | null;
  /** Only set when the provider gave a genuinely distinct "after
   * deductions" figure — Trading 212's order/dividend objects, as
   * currently fetched, never separate gross from net, so this is null
   * everywhere today rather than guessed at. */
  netAmount: number | null;
  /** The real fee amount — only ever populated for a `kind: "fee"`
   * transaction (the transaction's own amount IS the fee); null
   * everywhere else, since no other synced object carries a separate fee
   * figure. Never invented. */
  fees: number | null;
  currency: string | null;
  /** The underlying order's external id, for an order/execution item —
   * null for dividends/transactions, which aren't tied to an order. */
  orderId: string | null;
  /** The provider's own identifier for the underlying record (order id,
   * dividend reference, or transaction reference) — Requirement 14:
   * always preserved for traceability back to Trading 212. */
  externalId: string;
  /** The order's own raw status string, when this item derives from an
   * order — null for dividends/transactions. */
  status: string | null;
  direction: "BUY" | "SELL" | "IN" | "OUT" | null;
  /** The raw provider type/category string when this item's `kind`
   * bucket is an approximation — e.g. a transaction type Trading 212
   * returns that isn't DEPOSIT/WITHDRAW/FEE gets bucketed as "transfer"
   * but keeps its real original type here (Requirement 8: "preserve the
   * raw/provider type rather than guessing"). Null when `kind` already
   * exactly matches the provider's own category. */
  rawType: string | null;
};

function resolveAssetName(compassAssetId: string | null, externalName: string | null, externalTicker: string): string {
  const asset = compassAssetId ? getAsset(compassAssetId) : undefined;
  return asset?.name ?? externalName ?? externalTicker;
}

function normalizeDirection(side: string | null | undefined): "BUY" | "SELL" | null {
  return side === "BUY" || side === "SELL" ? side : null;
}

export type OrderRowInput = {
  externalId: string;
  compassAssetId: string | null;
  externalTicker: string;
  externalName: string | null;
  side: string | null;
  status: string | null;
  quantity: number | null;
  filledQuantity: number | null;
  fillPrice: number | null;
  filledValue: number | null;
  currencyCode: string | null;
  occurredAt: string;
};

/** Requirement 5/6/13: derives 1 or 2 display items from ONE order row.
 *
 * - Filled quantity is 0 (or absent) → only an "order" item (no
 *   execution occurred — Requirement 5: never count an order as a trade
 *   merely because it exists).
 * - Filled quantity ≥ requested quantity (fully filled, both known) →
 *   only an "execution" item — showing an identical "order" view
 *   alongside it would be the redundant duplicate Requirement 13 warns
 *   against.
 * - Otherwise (a genuine partial fill, OR filled > 0 but the requested
 *   quantity isn't known so "fully filled" can't be confirmed) → BOTH
 *   items, exactly matching Requirement 6's worked example (order status
 *   shown alongside the real executed quantity, never the requested one).
 */
export function normalizeOrderRow(order: OrderRowInput): NormalizedActivityItem[] {
  const filled = order.filledQuantity ?? 0;
  const hasExecution = filled > 0;
  const isConfirmedFullyFilled = hasExecution && order.quantity != null && filled >= order.quantity;

  const assetName = resolveAssetName(order.compassAssetId, order.externalName, order.externalTicker);
  const direction = normalizeDirection(order.side);
  const items: NormalizedActivityItem[] = [];

  if (!isConfirmedFullyFilled) {
    items.push({
      provider: "trading212",
      kind: "order",
      id: `${order.externalId}:order`,
      compassAssetId: order.compassAssetId,
      assetName,
      rawTicker: order.externalTicker,
      occurredAt: order.occurredAt,
      quantity: order.quantity,
      // An order's own requested/limit price isn't a field this
      // integration has ever captured (see trading212-client.ts) — never
      // fabricated here either.
      price: null,
      grossAmount: null,
      netAmount: null,
      fees: null,
      currency: order.currencyCode,
      orderId: order.externalId,
      externalId: order.externalId,
      status: order.status,
      direction,
      rawType: null,
    });
  }

  if (hasExecution) {
    const grossAmount = order.filledValue ?? (order.fillPrice != null ? order.fillPrice * filled : null);
    items.push({
      provider: "trading212",
      kind: "execution",
      id: `${order.externalId}:execution`,
      compassAssetId: order.compassAssetId,
      assetName,
      rawTicker: order.externalTicker,
      occurredAt: order.occurredAt,
      quantity: filled,
      price: order.fillPrice,
      grossAmount,
      netAmount: null,
      fees: null,
      currency: order.currencyCode,
      orderId: order.externalId,
      externalId: order.externalId,
      status: order.status,
      direction,
      rawType: null,
    });
  }

  return items;
}

export type DividendRowInput = {
  externalId: string;
  compassAssetId: string | null;
  externalTicker: string | null;
  externalName: string | null;
  quantity: number | null;
  amount: number;
  currencyCode: string | null;
  occurredAt: string;
};

export function normalizeDividendRow(dividend: DividendRowInput): NormalizedActivityItem {
  return {
    provider: "trading212",
    kind: "dividend",
    id: `${dividend.externalId}:dividend`,
    compassAssetId: dividend.compassAssetId,
    assetName: dividend.externalTicker
      ? resolveAssetName(dividend.compassAssetId, dividend.externalName, dividend.externalTicker)
      : (dividend.externalName ?? null),
    rawTicker: dividend.externalTicker,
    occurredAt: dividend.occurredAt,
    quantity: dividend.quantity,
    price: null,
    // Trading 212's dividend records, as currently fetched, expose one
    // real amount figure — treated as the gross/paid amount. No separate
    // withholding-tax field has been confirmed in this integration, so
    // netAmount stays null rather than assuming amount is already net.
    grossAmount: dividend.amount,
    netAmount: null,
    fees: null,
    currency: dividend.currencyCode,
    orderId: null,
    externalId: dividend.externalId,
    status: null,
    direction: "IN",
    rawType: null,
  };
}

export type TransactionRowInput = {
  externalId: string;
  type: string;
  amount: number;
  currencyCode: string | null;
  occurredAt: string;
};

function mapTransactionKind(type: string): { kind: Trading212ActivityKind; rawType: string | null } {
  switch (type) {
    case "DEPOSIT":
      return { kind: "deposit", rawType: null };
    case "WITHDRAW":
      return { kind: "withdrawal", rawType: null };
    case "FEE":
      return { kind: "fee", rawType: null };
    default:
      // Requirement 8: a real transaction type this integration doesn't
      // have a dedicated bucket for (e.g. TRANSFER, or a future Trading
      // 212 type) — bucketed under "transfer" as the honest catch-all,
      // but the ORIGINAL provider string is preserved here rather than
      // silently discarded.
      return { kind: "transfer", rawType: type };
  }
}

export function normalizeTransactionRow(transaction: TransactionRowInput): NormalizedActivityItem {
  const { kind, rawType } = mapTransactionKind(transaction.type);
  return {
    provider: "trading212",
    kind,
    id: `${transaction.externalId}:transaction`,
    compassAssetId: null,
    assetName: null,
    rawTicker: null,
    occurredAt: transaction.occurredAt,
    quantity: null,
    price: null,
    grossAmount: transaction.amount,
    netAmount: null,
    fees: kind === "fee" ? Math.abs(transaction.amount) : null,
    currency: transaction.currencyCode,
    orderId: null,
    externalId: transaction.externalId,
    status: null,
    direction: kind === "deposit" ? "IN" : kind === "withdrawal" ? "OUT" : null,
    rawType,
  };
}
