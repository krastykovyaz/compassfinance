import { randomBytes } from "crypto";
import { prisma } from "@/server/db/prisma";
import { toSupportedLocale } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

const CODE_LENGTH = 8;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids visually-ambiguous codes in a shared link

function generateCandidateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Returns the user's referral code, generating and persisting one on
 * first call if they don't have one yet. Never regenerates an existing
 * code — the same link stays valid for as long as the user keeps it.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  // Collision retry loop — astronomically unlikely at this alphabet/length
  // (33^8 ≈ 1.4 * 10^12 possibilities), but a real check costs nothing.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCandidateCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: candidate },
        select: { referralCode: true },
      });
      return updated.referralCode!;
    } catch {
      // Unique constraint collision — try again with a new candidate.
      continue;
    }
  }
  throw new Error("Failed to generate a unique referral code");
}

export async function getUserIdByReferralCode(code: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * Returns the referrer's account language for an invite code — null means
 * the code doesn't exist at all (distinct from "exists but has no locale
 * set", which resolves to English). Never returns the referrer's name,
 * email, or id — same public-safety stance as getUserIdByReferralCode.
 */
export async function getReferrerLocaleByCode(code: string): Promise<Locale | null> {
  const user = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { locale: true },
  });
  if (!user) return null;
  return toSupportedLocale(user.locale);
}

/**
 * Attributes a newly-created user to their referrer — called exactly
 * once, from auth.ts's events.createUser. The `referredByUserId: null`
 * guard in the where-clause is what makes duplicate attribution
 * structurally impossible: this update only ever matches (and only ever
 * succeeds) the very first time it's called for a given user, since
 * every subsequent call finds referredByUserId already non-null and
 * matches zero rows.
 */
export async function attributeReferral(newUserId: string, referrerUserId: string): Promise<void> {
  if (newUserId === referrerUserId) return; // never attribute a self-referral
  await prisma.user.updateMany({
    where: { id: newUserId, referredByUserId: null },
    data: { referredByUserId: referrerUserId },
  });
}

export async function getReferralCount(userId: string): Promise<number> {
  return prisma.user.count({ where: { referredByUserId: userId } });
}
