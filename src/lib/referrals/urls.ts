/**
 * Builds the shareable referral URL for a given origin + code. `origin`
 * is taken from the actual incoming request (see the API route) rather
 * than a hardcoded/invented domain — it's always the real host the app
 * is currently served from, dev or production alike.
 */
export function buildReferralUrl(origin: string, code: string): string {
  return `${origin}/invite/${code}`;
}

export function buildAchievementShareUrl(origin: string, token: string): string {
  return `${origin}/share/achievement/${token}`;
}
