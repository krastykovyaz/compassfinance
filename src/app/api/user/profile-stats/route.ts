import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    // Real count of linked OAuth identities (Google, etc.) from Auth.js's
    // own Account table — never a hardcoded/mock number. A user who has
    // only ever used passwordless email sign-in genuinely has 0 here.
    const connectedAccountsCount = await prisma.account.count({ where: { userId } });
    return { connectedAccountsCount };
  });
}
