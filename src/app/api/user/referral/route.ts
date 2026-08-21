import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { getOrCreateReferralCode, getReferralCount } from "@/server/repositories/referral-repository";
import { buildReferralUrl, getRequestOrigin } from "@/lib/referrals/urls";

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    // requireUserId() throws UnauthenticatedError for a signed-out
    // visitor, which withApiErrorHandling turns into a 401 — an
    // unauthenticated visitor never receives a personal referral code.
    const userId = await requireUserId();
    const [code, referralCount] = await Promise.all([
      getOrCreateReferralCode(userId),
      getReferralCount(userId),
    ]);
    return { code, url: buildReferralUrl(getRequestOrigin(req), code), referralCount };
  });
}
