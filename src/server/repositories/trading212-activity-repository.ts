import "server-only";
import { prisma } from "@/server/db/prisma";
import {
  normalizeOrderRow,
  normalizeDividendRow,
  normalizeTransactionRow,
  type NormalizedActivityItem,
} from "@/lib/trading212/activity-normalizer";

const PROVIDER = "trading212";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type Trading212ActivityKindFilter =
  | "all"
  | "orders"
  | "trades"
  | "dividends"
  | "fees"
  | "deposits"
  | "withdrawals";

export type Trading212ActivityPage = {
  items: NormalizedActivityItem[];
  nextCursor: string | null;
};

type Cursor = { before: string };

function encodeCursor(occurredAt: string): string {
  return Buffer.from(JSON.stringify({ before: occurredAt } satisfies Cursor), "utf8").toString("base64url");
}

/** Never throws on a malformed/tampered cursor — treated as "start from
 * the beginning" (Requirement 11: the UI must never error out over a bad
 * cursor; Requirement 17: cursor values are opaque and never trusted as
 * anything but a pagination hint scoped to this same, already-verified
 * userId's own query). */
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

/** Cursor-paginated, provider-neutral Trading 212 activity feed
 * (Requirement 11) — reads real synchronized rows only, never touches
 * Trading 212's own API. `kind` narrows to a single underlying table when
 * possible (Requirement 10's filters map cleanly onto one table each,
 * except "all"/"orders"+"trades" both read BrokerageOrder but keep only
 * one of the two derived views per row — see activity-normalizer.ts).
 * Every query is scoped to `userId` AND the caller's own connection —
 * there is no code path here that accepts a connectionId/accountId from
 * a caller (Requirement 17). */
export async function getTrading212Activity(
  userId: string,
  options?: { assetId?: string; kind?: Trading212ActivityKindFilter; cursor?: string; limit?: number }
): Promise<Trading212ActivityPage> {
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
    // Transactions never carry an asset (Requirement 9), so an
    // asset-scoped "orders"/"trades" view naturally excludes them by only
    // ever querying BrokerageOrder here.
    const rows = await prisma.brokerageOrder.findMany({
      where: { userId, brokerageConnectionId: connection.id, ...assetWhere, ...dateWhere },
      orderBy: { externalCreatedAt: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const wantKind = kind === "orders" ? "order" : "execution";
    const items = page.flatMap((row) => normalizeOrderRow(toOrderInput(row)).filter((item) => item.kind === wantKind));
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
    const items = page.map((row) => normalizeDividendRow(toDividendInput(row)));
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].externalCreatedAt.toISOString()) : null;
    return { items, nextCursor };
  }

  if (kind === "fees" || kind === "deposits" || kind === "withdrawals") {
    if (options?.assetId) return { items: [], nextCursor: null }; // Requirement 9: account-level events never belong to an asset
    const type = kind === "fees" ? "FEE" : kind === "deposits" ? "DEPOSIT" : "WITHDRAW";
    const rows = await prisma.brokerageTransaction.findMany({
      where: { userId, brokerageConnectionId: connection.id, type, ...dateWhere },
      orderBy: { externalCreatedAt: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const items = page.map((row) => normalizeTransactionRow(toTransactionInput(row)));
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].externalCreatedAt.toISOString()) : null;
    return { items, nextCursor };
  }

  // kind === "all": merge all three sources. Each is fetched and
  // normalized independently, concatenated, sorted newest-first by the
  // PROVIDER's own timestamp (Requirement 12 — never DB insertion time),
  // then trimmed to `limit`. `nextCursor` is derived from the last
  // included item so the next call's `lt` filter naturally continues
  // past it on every table at once.
  const transactionWhere = options?.assetId ? null : { userId, brokerageConnectionId: connection.id, ...dateWhere };
  const [orderRows, dividendRows, transactionRows] = await Promise.all([
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
    transactionWhere
      ? prisma.brokerageTransaction.findMany({ where: transactionWhere, orderBy: { externalCreatedAt: "desc" }, take: limit + 1 })
      : Promise.resolve([]),
  ]);

  const sourceHasMore =
    orderRows.length > limit || dividendRows.length > limit || transactionRows.length > limit;

  const candidates: NormalizedActivityItem[] = [
    ...orderRows.slice(0, limit).flatMap((row) => normalizeOrderRow(toOrderInput(row))),
    ...dividendRows.slice(0, limit).map((row) => normalizeDividendRow(toDividendInput(row))),
    ...transactionRows.slice(0, limit).map((row) => normalizeTransactionRow(toTransactionInput(row))),
  ];
  candidates.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const hasMore = sourceHasMore || candidates.length > limit;
  const items = candidates.slice(0, limit);
  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1].occurredAt) : null;

  return { items, nextCursor };
}

// --- Prisma row -> normalizer input adapters --------------------------
// Kept as small named functions (not inline) so the shape each
// normalizer actually needs is visible in one place per source.

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

function toDividendInput(row: {
  externalId: string;
  compassAssetId: string | null;
  externalTicker: string | null;
  externalName: string | null;
  quantity: number | null;
  amount: number;
  currencyCode: string | null;
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
    occurredAt: row.externalCreatedAt.toISOString(),
  };
}

function toTransactionInput(row: { externalId: string; type: string; amount: number; currencyCode: string | null; externalCreatedAt: Date }) {
  return {
    externalId: row.externalId,
    type: row.type,
    amount: row.amount,
    currencyCode: row.currencyCode,
    occurredAt: row.externalCreatedAt.toISOString(),
  };
}
