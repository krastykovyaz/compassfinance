import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { getInteractiveBrokersPortfolio } from "@/server/repositories/interactive-brokers-portfolio-repository";

// Phase 2 — read-only account summary + open positions for the Portfolio
// page's Interactive Brokers section, mirroring GET /api/user/trading212/
// portfolio exactly. userId always comes from requireUserId(), never the
// request — see api-routes-idor.test.ts.

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return { portfolio: await getInteractiveBrokersPortfolio(userId) };
  });
}
