import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import {
  getInteractiveBrokersActivity,
  type InteractiveBrokersActivityKindFilter,
} from "@/server/repositories/interactive-brokers-activity-repository";

// Phase 3 — cursor-paginated, filterable activity feed for the Portfolio
// page's Interactive Brokers panel and, filtered by `assetId`, the
// asset-detail page's "your Interactive Brokers history for this asset"
// section — mirrors GET /api/user/trading212/activity exactly. userId
// always comes from requireUserId(), never the request — see
// api-routes-idor.test.ts. `assetId`/`kind`/`cursor` only ever narrow the
// CALLER's own already-scoped data (every underlying query is also
// filtered by userId).

const VALID_KINDS: InteractiveBrokersActivityKindFilter[] = [
  "all",
  "orders",
  "trades",
  "dividends",
  "fees",
  "deposits",
  "withdrawals",
];

function parseKind(raw: string | null): InteractiveBrokersActivityKindFilter | undefined {
  return raw && (VALID_KINDS as string[]).includes(raw) ? (raw as InteractiveBrokersActivityKindFilter) : undefined;
}

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const assetId = req.nextUrl.searchParams.get("assetId") ?? undefined;
    const kind = parseKind(req.nextUrl.searchParams.get("kind"));
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const page = await getInteractiveBrokersActivity(userId, { assetId, kind, cursor, limit });
    return { activity: page.items, nextCursor: page.nextCursor };
  });
}
