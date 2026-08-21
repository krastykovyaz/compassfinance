import "server-only";
import { prisma } from "@/server/db/prisma";
import type { Locale } from "@/lib/i18n/types";
import type { RiskProfileId } from "@/lib/risk-profile/risk-profiles";
import { isValidLocale, isValidRiskProfileId } from "@/server/validation";

export type ProfileDTO = {
  locale: Locale | null;
  riskProfileId: RiskProfileId | null;
  onboardingCompleted: boolean;
};

function toDTO(user: {
  locale: string | null;
  riskProfileId: string | null;
  onboardingCompletedAt: Date | null;
}): ProfileDTO {
  return {
    locale: user.locale && isValidLocale(user.locale) ? user.locale : null,
    riskProfileId:
      user.riskProfileId && isValidRiskProfileId(user.riskProfileId)
        ? user.riskProfileId
        : null,
    onboardingCompleted: user.onboardingCompletedAt !== null,
  };
}

export async function getProfile(userId: string): Promise<ProfileDTO> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { locale: true, riskProfileId: true, onboardingCompletedAt: true },
  });
  return toDTO(user);
}

export async function updateLocale(userId: string, locale: string): Promise<ProfileDTO> {
  if (!isValidLocale(locale)) {
    throw new Error(`Invalid locale: ${locale}`);
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { locale },
    select: { locale: true, riskProfileId: true, onboardingCompletedAt: true },
  });
  return toDTO(user);
}

// Server never accepts an arbitrary client-supplied risk-profile string —
// only one of the exact existing canonical Compass values (Section 9).
export async function updateRiskProfile(
  userId: string,
  riskProfileId: string
): Promise<ProfileDTO> {
  if (!isValidRiskProfileId(riskProfileId)) {
    throw new Error(`Invalid riskProfileId: ${riskProfileId}`);
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { riskProfileId },
    select: { locale: true, riskProfileId: true, onboardingCompletedAt: true },
  });
  return toDTO(user);
}

export async function completeOnboarding(userId: string): Promise<ProfileDTO> {
  const user = await prisma.user.update({
    where: { id: userId },
    // idempotent: re-completing onboarding just re-stamps the same fact
    data: { onboardingCompletedAt: new Date() },
    select: { locale: true, riskProfileId: true, onboardingCompletedAt: true },
  });
  return toDTO(user);
}
