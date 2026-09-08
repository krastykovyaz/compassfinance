import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import {
  getTrading212Activity,
  type Trading212ActivityKindFilter,
} from "@/server/repositories/trading212-activity-repository";

// Phase 4 — cursor-paginated, filterable, order/execution-aware activity
// feed for the app's history UI and, filtered by `assetId`, the
// asset-detail page's "your Trading 212 history for this asset" section.
// userId always comes from requireUserId(), never the request — see
// api-routes-idor.test.ts. `assetId`, `kind`, and `cursor` only ever
// narrow the CALLER's own already-scoped data — every underlying query in
// the repository is also filtered by userId, so none of these
// client-supplied values can reach another user's rows (Requirement 17).

const VALID_KINDS: Trading212ActivityKindFilter[] = [
  "all",
  "orders",
  "trades",
  "dividends",
  "fees",
  "deposits",
  "withdrawals",
];

function parseKind(raw: string | null): Trading212ActivityKindFilter | undefined {
  return raw && (VALID_KINDS as string[]).includes(raw) ? (raw as Trading212ActivityKindFilter) : undefined;
}

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const assetId = req.nextUrl.searchParams.get("assetId") ?? undefined;
    const kind = parseKind(req.nextUrl.searchParams.get("kind"));
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const page = await getTrading212Activity(userId, { assetId, kind, cursor, limit });
    return { activity: page.items, nextCursor: page.nextCursor };
  });
}
