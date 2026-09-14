import "server-only";

// Sync-time (raw IBKR API row → DB fields) helpers for Phase 3 activity
// sync — kept separate from the read-side normalizer
// (src/lib/portfolio/activity-normalizer.ts, which turns STORED rows into
// display items) exactly mirroring how trading212-sync.ts's own
// upsertOrders/upsertDividends/upsertTransactions do their own inline
// field mapping distinct from activity-normalizer.ts's read-side
// functions — normalization-for-storage and normalization-for-display
// are deliberately two different concerns in this codebase already.

/** IBKR's POST /pa/transactions response provides NO unique id for any
 * row at all (verified directly against its documented response schema —
 * date/cur/fxRate/pr/qty/acctid/amt/conid/type/desc, no id or reference
 * field) — see interactive-brokers-client.ts's own header comment on this
 * endpoint. This builds a deterministic idempotency key instead, from
 * FIVE stable, real fields the provider itself reported (conid, the
 * exact ISO date string, signed quantity, price, amount) — never a
 * timestamp alone, never a random UUID, per the explicit "never use
 * timestamps alone" instruction. Running sync twice against identical
 * IBKR data reproduces the identical key both times, which is exactly
 * the idempotency property BrokerageOrder/BrokerageActivity's own
 * `@@unique([brokerageConnectionId, externalId])` constraint relies on.
 *
 * Documented, accepted edge case: two genuinely distinct real-world
 * transactions on the same conid, same day, same quantity, same price,
 * AND same amount would collide onto the same key — the same accepted
 * risk Trading 212's own dividend fallback-id scheme
 * (trading212-repository.ts's upsertDividends) already carries, since
 * IBKR's API gives nothing more specific to key on. */
export function buildInteractiveBrokersTransactionExternalId(row: {
  conid: number;
  occurredAt: string;
  quantity: number;
  price: number | null;
  amount: number;
}): string {
  return `ibkr-txn:${row.conid}:${row.occurredAt}:${row.quantity}:${row.price ?? "null"}:${row.amount}`;
}

/** Only "Buy"/"Sell" (case-insensitive) are confirmed from IBKR's own
 * documented example response for /pa/transactions — everything else is
 * routed to BrokerageActivity instead of BrokerageOrder (see
 * interactive-brokers-sync.ts's own activity step). */
export function isInteractiveBrokersTradeType(type: string): boolean {
  const normalized = type.toLowerCase();
  return normalized === "buy" || normalized === "sell";
}
