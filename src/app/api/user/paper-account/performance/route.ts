import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { getPerformanceHistory } from "@/server/services/trading-service";
import { PERFORMANCE_RANGES, PerformanceRange } from "@/lib/trading/types";

function isPerformanceRange(value: string | null): value is PerformanceRange {
  return !!value && (PERFORMANCE_RANGES as string[]).includes(value);
}

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const rangeParam = req.nextUrl.searchParams.get("range");
    const range: PerformanceRange = isPerformanceRange(rangeParam) ? rangeParam : "1D";
    const points = await getPerformanceHistory(userId, range);
    return { points };
  });
}
