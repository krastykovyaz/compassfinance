import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { cookies } from "next/headers";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db/prisma";
import { sendCompassAuthEmail } from "@/lib/email/send-auth-email";
import { assertProductionSecret } from "@/server/auth/secret-check";
import { attributeReferral, getUserIdByReferralCode } from "@/server/repositories/referral-repository";

// ---------------------------------------------------------------------------
// One stable Compass user id, multiple linked auth identities (Section 2/7).
//
// - session strategy: "database" — sessions live in the `sessions` table, so
//   `sessionToken` (an opaque cookie value) is the only thing the browser
//   ever holds. No JWT secrets to rotate, no auth state duplicated client-side.
// - PrismaAdapter resolves every provider (Google, email) to the same `User`
//   row keyed by `id`. Auth.js's adapter already refuses to silently merge
//   two different emails — an email identity is only ever attached to a User
//   once that address has been verified via the magic-link flow itself, and
//   Google may link to an existing email account only when Google marks the
//   OAuth email as verified; the signIn callback enforces that trust boundary.
// ---------------------------------------------------------------------------

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const authSecret = process.env.AUTH_SECRET;

// Milestone 12, Section 2: fail loudly and specifically in production if
// the secret is missing — a vague `[auth][error] MissingSecret` 500 deep
// inside Auth.js internals is not an acceptable failure mode for a
// production deploy. In development, Auth.js's own error (visible in the
// server console, and on `/api/auth/session` specifically, since that's
// the one route that always exercises the secret) is left to surface
// as-is once a request actually needs it — nothing here should crash the
// whole dev server just because someone hasn't gotten to auth setup yet;
// guest-mode pages (Section 7) don't touch this at all.
assertProductionSecret(process.env.NODE_ENV, authSecret);

export const authConfig: NextAuthConfig = {
  // Explicit rather than relying on Auth.js's implicit AUTH_SECRET
  // env-var pickup — same effective behavior, but failures are traceable
  // to this exact line instead of "somewhere inside NextAuth()".
  secret: authSecret,
  // Keep the underlying adapter failure visible during local development.
  // Auth.js otherwise wraps database errors as a generic AdapterError, which
  // makes a missing/unmigrated local SQLite schema unnecessarily hard to
  // diagnose. Do not expose database details to clients.
  logger: {
    error(error) {
      // TEMP diagnostic logging — revert after debugging the production
      // sign-in failure on compassfinance.online.
      console.error("[auth:adapter]", error);
    },
  },
  // Prisma's generated client type lives at a custom output path
  // (see prisma/schema.prisma), so it isn't structurally identical to the
  // `@prisma/client` type @auth/prisma-adapter imports for its signature —
  // it is compatible at runtime (same shape), hence the cast.
  adapter: PrismaAdapter(prisma as never),
  session: { strategy: "database" },
  trustHost: true,
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/verify-request",
    error: "/signin/error",
  },
  providers: [
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            // Compass supports both passwordless email and Google sign-in.
            // If a user first creates an account by email and later chooses
            // Google with the SAME verified address, Auth.js must link the
            // Google identity to that existing User instead of returning
            // OAuthAccountNotLinked. We guard this in the signIn callback
            // below by requiring Google's email_verified claim.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    {
      id: "compass-email",
      type: "email",
      name: "Email",
      from: process.env.EMAIL_FROM ?? "CompassFinance <no-reply@compass.app>",
      maxAge: 15 * 60, // short-lived — 15 minutes (Section 4)
      async sendVerificationRequest({ identifier, url }) {
        await sendCompassAuthEmail({ to: identifier, url });
      },
      // Real, DB-backed, single-use tokens — Auth.js hashes the token
      // before it's stored (see @auth/core's default generateVerificationToken
      // + the adapter's createVerificationToken) and deletes it on first use
      // (useVerificationToken), so nothing plaintext or reusable ever lives
      // in `verification_tokens` (Section 4).
      options: {},
    },
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Only allow automatic email-based account linking for Google when
      // Google explicitly says the email address is verified. This prevents
      // an unverified OAuth email from claiming an existing Compass user.
      if (account?.provider === "google") {
        return profile?.email_verified === true;
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    // Milestone 24: referral attribution. Fires exactly once per user,
    // at the moment their row is first created — never on a returning
    // sign-in — so this is inherently the one and only chance to set
    // referredByUserId, and attributeReferral()'s own null-guard makes
    // a second/duplicate attribution impossible even if this callback
    // somehow ran twice for the same user. The referral code itself
    // came from proxy.ts reading /invite/<code> and setting a cookie
    // before the sign-in flow started; if there's no cookie, or it
    // doesn't resolve to a real user, this is simply a no-op — a normal
    // sign-up with no referrer.
    async createUser({ user }) {
      if (!user.id) return;
      try {
        const cookieStore = await cookies();
        const code = cookieStore.get("compass_referral_code")?.value;
        if (!code) return;
        const referrerUserId = await getUserIdByReferralCode(code);
        if (!referrerUserId) return;
        await attributeReferral(user.id, referrerUserId);
      } catch (err) {
        // Referral attribution is best-effort — it must never block or
        // break account creation itself.
        console.error("[auth:referral] failed to attribute referral:", err);
      }
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
