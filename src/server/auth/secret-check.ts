/**
 * Pure validation logic for AUTH_SECRET, split out from auth.ts so it can
 * be unit-tested without importing anything Prisma-backed (auth.ts pulls
 * in the Prisma client via PrismaAdapter, which needs a generated client
 * to even import — see secret-check.test.ts for why this file
 * deliberately has zero imports).
 *
 * Milestone 12, Section 2: "Auth.js must fail clearly if a production
 * secret is missing, but local development should work once .env.local
 * contains AUTH_SECRET."
 */
export function assertProductionSecret(nodeEnv: string | undefined, secret: string | undefined): void {
  if (nodeEnv === "production" && !secret) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with `openssl rand -base64 33` " +
        "and set it in your production environment — see .env.example."
    );
  }
}
