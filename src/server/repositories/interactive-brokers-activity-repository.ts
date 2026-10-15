import "server-only";
import { prisma } from "@/server/db/prisma";
import {
  normalizeOrderRow,
  normalizeInteractiveBrokersActivityRow,
  type NormalizedActivityItem,
} from "@/lib/portfolio/activity-normalizer";

// Phase 3 — mirrors trading212-activity-repository.ts's exact contract
// (cursor pagination, `kind` filter, per-table queries) for Interactive
// Brokers' own activity, reusing the SAME BrokerageOrder/BrokerageActivity
// tables and the SAME NormalizedActivityItem shape (see
// activity-normalizer.ts) — only the provider scope and, for "fees"/
// "deposits"/"withdrawals", the underlying data availability differ:
//
// Two connection methods fill these tables (see interactive-brokers-repository.ts):
// the vendor OAuth sync, whose only history source (POST /pa/transactions) is
// conid-scoped and returns no account-level cash movements, and the Flex
// report sync, which does include deposits, withdrawals and fees. Both store
// their non-trade rows in BrokerageActivity with IBKR's own type string
// preserved, and the "dividends", "fees", "deposits" and "withdrawals"
// filters all read that one table. For an account connected only through the
// OAuth sync the last three therefore stay empty, which is an honest
// reflection of what that source provides, never a fabricated zero.
//
// Cursor design: IBKR's /pa/transactions only reports a DAY-granularity
// date ("Mon Jan 29 00:00:00 EST 2024" — see interactive-brokers-client.ts's
// own parsing comment), so every trade/activity row on the same day shares
// an IDENTICAL externalCreatedAt. A cursor keyed on that timestamp ALONE
// (`lt: cursor`) silently drops any same-day rows beyond one page's limit
// forever — the next page's `lt` excludes the entire day. Every cursor
// here therefore carries a per-table (timestamp, id) pair as a tie-break,
// and every query orders by the same (externalCreatedAt, id) pair, so
// pagination can resume exactly after the last row actually returned
// regardless of how many rows share one timestamp.

const PROVIDER = "INTERACTIVE_BROKERS";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type InteractiveBrokersActivityKindFilter =
  | "all"
  | "orders"
  | "trades"
  | "dividends"
  | "fees"
  | "deposits"
  | "withdrawals";

export type InteractiveBrokersActivityPage = {
  items: NormalizedActivityItem[];
  nextCursor: string | null;
};

type TableCursor = { at: string; id: string };
type Cursor = { orders?: TableCursor; activity?: TableCursor };

const ACTIVITY_TABLE_KINDS = { dividends: "dividend", fees: "fee", deposits: "deposit", withdrawals: "withdrawal" } as const;

const ORDER_BY_WITH_TIEBREAK = [{ externalCreatedAt: "desc" as const }, { id: "desc" as const }];

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function isValidTableCursor(value: unknown): value is TableCursor {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.at === "string" && typeof v.id === "string" && !Number.isNaN(new Date(v.at).getTime());
}

/** `undefined` = no cursor was sent (first page). `null` = a cursor WAS sent
 * but is not one of ours. The two must stay distinguishable: the caller ends
 * pagination on an invalid cursor rather than treating it as "start again",
 * because every caller of a cursor is a "load more" that APPENDS — serving
 * page one again there shows every row twice. */
function decodeCursor(raw: string | undefined): Cursor | null | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const cursor: Cursor = {};
    // A malformed/tampered cursor must never reach Prisma as `new
    // Date(NaN)` — that throws a PrismaClientValidationError whose
    // message (model/field names, the full WHERE shape) gets forwarded
    // to the client verbatim by withApiErrorHandling. Reject anything
    // that doesn't validate rather than guessing.
    if (parsed.orders !== undefined) {
      if (!isValidTableCursor(parsed.orders)) return null;
      cursor.orders = parsed.orders;
    }
    if (parsed.activity !== undefined) {
      if (!isValidTableCursor(parsed.activity)) return null;
      cursor.activity = parsed.activity;
    }
    // Neither key present means this isn't one of our cursors at all (e.g.
    // a stale flat `{before: ...}` cursor from before the compound-cursor
    // rewrite).
    if (cursor.orders === undefined && cursor.activity === undefined) return null;
    return cursor;
  } catch {
    return null;
  }
}

/** `lt` on (externalCreatedAt, id) treated as one compound sort key,
 * matching ORDER_BY_WITH_TIEBREAK exactly. */
function tableWhere(sub: TableCursor | undefined) {
  if (!sub) return {};
  const at = new Date(sub.at);
  return { OR: [{ externalCreatedAt: { lt: at } }, { externalCreatedAt: at, id: { lt: sub.id } }] };
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function toOrderInput(row: {
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
  externalCreatedAt: Date;
}) {
  return {
    externalId: row.externalId,
    compassAssetId: row.compassAssetId,
    externalTicker: row.externalTicker,
    externalName: row.externalName,
    side: row.side,
    status: row.status,
    quantity: row.quantity,
    filledQuantity: row.filledQuantity,
    fillPrice: row.fillPrice,
    filledValue: row.filledValue,
    currencyCode: row.currencyCode,
    occurredAt: row.externalCreatedAt.toISOString(),
  };
}

function toActivityInput(row: {
  externalId: string;
  compassAssetId: string | null;
  externalTicker: string | null;
  externalName: string | null;
  quantity: number | null;
  amount: number;
  currencyCode: string | null;
  type: string;
  externalCreatedAt: Date;
}) {
  return {
    externalId: row.externalId,
    compassAssetId: row.compassAssetId,
    externalTicker: row.externalTicker,
    externalName: row.externalName,
    quantity: row.quantity,
    amount: row.amount,
    currencyCode: row.currencyCode,
    type: row.type,
    occurredAt: row.externalCreatedAt.toISOString(),
  };
}

// A single request never scans more than this many pages looking for
// matches, so a filter that matches almost nothing cannot turn one request
// into a walk over the whole table.
const MAX_SCAN_PAGES = 10;

/** Collects up to `limit` matching items by walking a table page by page.
 *
 * Needed because some filters cannot be expressed in the query ("dividend"
 * is classified from the raw type string; "order" vs "execution" is derived
 * from fill state), so a fetched page can contain few or no matches. A
 * single fetch-then-filter would return a short or EMPTY page while more
 * matches exist further on.
 *
 * `fetchPage(after)` must return rows after that position in
 * ORDER_BY_WITH_TIEBREAK order, at most `limit + 1` of them (the extra row
 * is how "is there another page" is known without a second query).
 *
 * The returned `next` is the position of the last row actually consumed —
 * never the end of the fetched page — so matches later in the same page are
 * picked up by the next request instead of being skipped. It is `null` when
 * the table is known to be exhausted, including when the limit is reached
 * exactly on the table's final row (otherwise the client is offered a
 * "load more" that returns nothing). */
async function scanForMatches<Row extends { id: string; externalCreatedAt: Date }>(params: {
  fetchPage: (after: TableCursor | undefined) => Promise<Row[]>;
  toItems: (row: Row) => NormalizedActivityItem[];
  start: TableCursor | undefined;
  limit: number;
}): Promise<{ items: NormalizedActivityItem[]; next: TableCursor | null }> {
  const { fetchPage, toItems, limit } = params;
  const items: NormalizedActivityItem[] = [];
  let position = params.start;

  for (let page = 0; page < MAX_SCAN_PAGES; page++) {
    const rows = await fetchPage(position);
    if (rows.length === 0) return { items, next: null };
    const pageHasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);

    for (let i = 0; i < pageRows.length; i++) {
      const row = pageRows[i];
      items.push(...toItems(row));
      position = { at: row.externalCreatedAt.toISOString(), id: row.id };
      if (items.length >= limit) {
        const rowsRemain = i < pageRows.length - 1 || pageHasMore;
        return { items: items.slice(0, limit), next: rowsRemain ? position : null };
      }
    }

    if (!pageHasMore) return { items, next: null };
  }

  // Scan budget spent with rows still unread: hand back where we stopped.
  return { items, next: position ?? null };
}

/** Cursor-paginated, filterable Interactive Brokers activity feed for the
 * Portfolio page's IBKR panel and, filtered by `assetId`, the
 * asset-detail page's per-asset history section — mirrors
 * getTrading212Activity's exact contract and IDOR-scoping discipline
 * (every underlying query is scoped by userId AND this connection, never
 * a caller-supplied connectionId/accountId — see
 * api-routes-idor.test.ts). */
export async function getInteractiveBrokersActivity(
  userId: string,
  options?: { assetId?: string; kind?: InteractiveBrokersActivityKindFilter; cursor?: string; limit?: number }
): Promise<InteractiveBrokersActivityPage> {
  const connection = await prisma.brokerageConnection.findUnique({
    where: { userId_provider: { userId, provider: PROVIDER } },
  });
  if (!connection) return { items: [], nextCursor: null };

  const limit = clampLimit(options?.limit);
  const cursor = decodeCursor(options?.cursor);
  // A cursor that isn't ours (tampered, or left over from an older cursor
  // format in a tab that stayed open across a deploy) ends the list here.
  if (cursor === null) return { items: [], nextCursor: null };
  const kind = options?.kind ?? "all";
  const assetWhere = options?.assetId ? { compassAssetId: options.assetId } : {};

  if (kind === "orders" || kind === "trades") {
    // "order" vs "execution" is derived per row from its fill state, so it
    // is filtered after the fetch (see scanForMatches). For one wanted kind
    // a row yields at most one item.
    const wantKind = kind === "orders" ? "order" : "execution";
    const { items, next } = await scanForMatches({
      start: cursor?.orders,
      limit,
      fetchPage: (after) =>
        prisma.brokerageOrder.findMany({
          where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...tableWhere(after) },
          orderBy: ORDER_BY_WITH_TIEBREAK,
          take: limit + 1,
        }),
      toItems: (row) =>
        normalizeOrderRow(toOrderInput(row), "interactive_brokers").filter((item) => item.kind === wantKind),
    });
    return { items, nextCursor: next ? encodeCursor({ orders: next }) : null };
  }

  if (kind === "dividends" || kind === "fees" || kind === "deposits" || kind === "withdrawals") {
    // None of these is its own DB column. They are all BrokerageActivity
    // rows, and the kind is decided at read time from IBKR's raw `type`
    // string (and, for deposits vs withdrawals, the sign of the amount) by
    // normalizeInteractiveBrokersActivityRow, so it cannot be pushed into
    // the Prisma `where` without duplicating that classification and
    // risking drift. IBKR keeps every non-trade row in this one table, so
    // most rows on a page may not be the wanted kind (see scanForMatches).
    const wantKind = ACTIVITY_TABLE_KINDS[kind];
    const { items, next } = await scanForMatches({
      start: cursor?.activity,
      limit,
      fetchPage: (after) =>
        prisma.brokerageActivity.findMany({
          where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...tableWhere(after) },
          orderBy: ORDER_BY_WITH_TIEBREAK,
          take: limit + 1,
        }),
      toItems: (row) => {
        const normalized = normalizeInteractiveBrokersActivityRow(toActivityInput(row));
        return normalized.kind === wantKind ? [normalized] : [];
      },
    });
    return { items, nextCursor: next ? encodeCursor({ activity: next }) : null };
  }

  // kind === "all": merge orders + activity (never transactions — always
  // empty for IBKR, see above), sorted newest-first by the PROVIDER's own
  // timestamp, trimmed to `limit`. Each table's own pagination cursor
  // advances independently, based on the LAST ROW FROM THAT TABLE that
  // actually made it into the displayed page — not the raw fetch
  // boundary — so a table that contributes nothing to this page (every
  // fetched row from it sorted after the other table's rows) keeps its
  // cursor unchanged and is correctly re-considered next page, rather
  // than silently skipping whatever didn't get displayed this time.
  const [orderRows, activityRows] = await Promise.all([
    prisma.brokerageOrder.findMany({
      where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...tableWhere(cursor?.orders) },
      orderBy: ORDER_BY_WITH_TIEBREAK,
      take: limit + 1,
    }),
    prisma.brokerageActivity.findMany({
      where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...tableWhere(cursor?.activity) },
      orderBy: ORDER_BY_WITH_TIEBREAK,
      take: limit + 1,
    }),
  ]);

  const orderHasMore = orderRows.length > limit;
  const activityHasMore = activityRows.length > limit;
  const orderPage = orderRows.slice(0, limit);
  const activityPage = activityRows.slice(0, limit);

  type Candidate = { item: NormalizedActivityItem; table: "orders" | "activity"; at: Date; id: string };
  // Kept separate from the merged `candidates` list below so the
  // "still pending" check can compare items-to-items: normalizeOrderRow
  // can yield TWO items (an "order" and an "execution") from one
  // BrokerageOrder row (a partially-filled order), so orderPage.length
  // (a ROW count) is not a valid stand-in for "how many items this table
  // could contribute" when deciding whether anything was left undisplayed.
  const orderCandidates: Candidate[] = orderPage.flatMap((row) =>
    normalizeOrderRow(toOrderInput(row), "interactive_brokers").map((item) => ({
      item,
      table: "orders" as const,
      at: row.externalCreatedAt,
      id: row.id,
    }))
  );
  const activityCandidates: Candidate[] = activityPage.map((row) => ({
    item: normalizeInteractiveBrokersActivityRow(toActivityInput(row)),
    table: "activity" as const,
    at: row.externalCreatedAt,
    id: row.id,
  }));
  const candidates: Candidate[] = [...orderCandidates, ...activityCandidates];
  candidates.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  const displayed = candidates.slice(0, limit);
  const items = displayed.map((c) => c.item);

  const lastOrderDisplayed = [...displayed].reverse().find((c) => c.table === "orders");
  const lastActivityDisplayed = [...displayed].reverse().find((c) => c.table === "activity");
  const nextOrdersCursor: TableCursor | undefined = lastOrderDisplayed
    ? { at: lastOrderDisplayed.at.toISOString(), id: lastOrderDisplayed.id }
    : cursor?.orders;
  const nextActivityCursor: TableCursor | undefined = lastActivityDisplayed
    ? { at: lastActivityDisplayed.at.toISOString(), id: lastActivityDisplayed.id }
    : cursor?.activity;

  const orderContributed = displayed.filter((c) => c.table === "orders").length;
  const activityContributed = displayed.filter((c) => c.table === "activity").length;
  const orderStillPending = orderHasMore || orderContributed < orderCandidates.length;
  const activityStillPending = activityHasMore || activityContributed < activityCandidates.length;
  const hasMore = orderStillPending || activityStillPending;

  const nextCursor = hasMore ? encodeCursor({ orders: nextOrdersCursor, activity: nextActivityCursor }) : null;

  return { items, nextCursor };
}
