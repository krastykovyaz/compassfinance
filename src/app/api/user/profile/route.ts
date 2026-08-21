import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import {
  getProfile,
  updateLocale,
  updateRiskProfile,
  completeOnboarding,
} from "@/server/repositories/profile-repository";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return getProfile(userId);
  });
}

export async function PATCH(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const body = await req.json();

    if (typeof body.locale === "string") {
      await updateLocale(userId, body.locale);
    }
    if (typeof body.riskProfileId === "string") {
      await updateRiskProfile(userId, body.riskProfileId);
    }
    if (body.onboardingCompleted === true) {
      await completeOnboarding(userId);
    }

    return getProfile(userId);
  });
}
