import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { getInteractiveBrokersConfig } from "@/server/interactive-brokers/interactive-brokers-config";
import {
  disconnectInteractiveBrokers,
  getInteractiveBrokersConnection,
} from "@/server/repositories/interactive-brokers-repository";

// Phase 1 — connection only (see the repository's own header comment):
// status + disconnect. There is no POST here — unlike Trading 212's
// paste-a-key-and-secret form, connecting is a redirect-based OAuth flow
// that starts at GET .../oauth/start, not a JSON body submit. userId
// always comes from requireUserId() (the session), never from the
// request — see api-routes-idor.test.ts's structural scan of every route
// under this directory for exactly that invariant.

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return {
      connection: await getInteractiveBrokersConnection(userId),
      // Whether the vendor OAuth sign-in can work on this server at all. It
      // cannot until Interactive Brokers has approved CompassFinance and the
      // IBKR_* settings exist; the screens then offer the Flex report
      // connection instead of a button that always fails.
      oauthAvailable: getInteractiveBrokersConfig() !== null,
    };
  });
}

export async function DELETE() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    await disconnectInteractiveBrokers(userId);
    return { disconnected: true };
  });
}
