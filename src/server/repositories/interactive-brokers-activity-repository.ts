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
// IBKR's one viable read-only history source (POST /pa/transactions) is
// conid-scoped and returns no account-level cash-movement rows at all —
// there is no live, non-Flex endpoint for deposits/withdrawals (see
// docs/integrations/interactive-brokers-phase-0.md's "Phase 3
// implementation" section) — so BrokerageTransaction is NEVER populated
// for provider=INTERACTIVE_BROKERS. The "fees"/"deposits"/"withdrawals"
// filters below therefore always return an empty page for IBKR — an
// honest reflection of what IBKR's Web API can actually provide, never a
// fabricated "0 items shown as if everything was checked."

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

type Cursor = { before: string };

function encodeCursor(occurredAt: string): string {
  return Buffer.from(JSON.stringify({ before: occurredAt } satisfies Cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return typeof parsed?.before === "string" ? { before: parsed.before } : null;
  } catch {
    return null;
  }
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
  const kind = options?.kind ?? "all";
  const assetWhere = options?.assetId ? { compassAssetId: options.assetId } : {};
  const dateWhere = cursor ? { externalCreatedAt: { lt: new Date(cursor.before) } } : {};

  if (kind === "orders" || kind === "trades") {
    const rows = await prisma.brokerageOrder.findMany({
      where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...dateWhere },
      orderBy: { externalCreatedAt: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const wantKind = kind === "orders" ? "order" : "execution";
    const items = page.flatMap((row) =>
      normalizeOrderRow(toOrderInput(row), "interactive_brokers").filter((item) => item.kind === wantKind)
    );
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].externalCreatedAt.toISOString()) : null;
    return { items, nextCursor };
  }

  if (kind === "dividends") {
    const rows = await prisma.brokerageActivity.findMany({
      where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...dateWhere },
      orderBy: { externalCreatedAt: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const items = page.map((row) => normalizeInteractiveBrokersActivityRow(toActivityInput(row))).filter((item) => item.kind === "dividend");
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].externalCreatedAt.toISOString()) : null;
    return { items, nextCursor };
  }

  // "fees" | "deposits" | "withdrawals" — always empty for IBKR (see this
  // file's own header comment: no live, non-Flex source exists for any
  // of these). Never an error — a real, honest "nothing here."
  if (kind === "fees" || kind === "deposits" || kind === "withdrawals") {
    return { items: [], nextCursor: null };
  }

  // kind === "all": merge orders + activity (never transactions — always
  // empty for IBKR, see above), sorted newest-first by the PROVIDER's own
  // timestamp, trimmed to `limit`.
  const [orderRows, activityRows] = await Promise.all([
    prisma.brokerageOrder.findMany({
      where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...dateWhere },
      orderBy: { externalCreatedAt: "desc" },
      take: limit + 1,
    }),
    prisma.brokerageActivity.findMany({
      where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...dateWhere },
      orderBy: { externalCreatedAt: "desc" },
      take: limit + 1,
    }),
  ]);

  const sourceHasMore = orderRows.length > limit || activityRows.length > limit;

  const candidates: NormalizedActivityItem[] = [
    ...orderRows.slice(0, limit).flatMap((row) => normalizeOrderRow(toOrderInput(row), "interactive_brokers")),
    ...activityRows.slice(0, limit).map((row) => normalizeInteractiveBrokersActivityRow(toActivityInput(row))),
  ];
  candidates.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const hasMore = sourceHasMore || candidates.length > limit;
  const items = candidates.slice(0, limit);
  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1].occurredAt) : null;

  return { items, nextCursor };
}
