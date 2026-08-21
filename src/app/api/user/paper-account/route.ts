import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { getAccountView } from "@/server/services/trading-service";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const account = await getAccountView(userId);
    return { account };
  });
}
