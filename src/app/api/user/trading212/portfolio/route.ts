import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { getTrading212Portfolio } from "@/server/repositories/trading212-portfolio-repository";

// Phase 2 — read-only account summary + open positions for the Portfolio
// page's Trading 212 section. userId always comes from requireUserId(),
// never the request — see api-routes-idor.test.ts.

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return { portfolio: await getTrading212Portfolio(userId) };
  });
}
