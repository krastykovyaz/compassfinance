import "server-only";
import type { ProviderFetchReason } from "./brokerage-provider";

// Phase 5 — Requirement 11: a shared vocabulary for "what kind of failure
// was this" that both the sync engine (deciding whether to flag a
// connection as needing attention) and observability logging use, so
// they can never drift into two different classification schemes.
export type Trading212ErrorCategory =
  | "AUTHENTICATION"
  | "PERMISSION"
  | "RATE_LIMIT"
  | "NETWORK"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "INTERNAL";

/** Maps a provider fetch's own `reason` onto the shared category
 * vocabulary. Trading 212's API, as actually observed, never
 * distinguishes 401 (bad credentials) from 403 (valid credentials,
 * insufficient permission) — both collapse into `trading212-client.ts`'s
 * "unauthorized" — so PERMISSION isn't reachable from a real fetch result
 * today; it exists in the vocabulary for a future provider (or a future
 * Trading 212 API revision) that DOES separate the two, and so
 * classifyThrownError below has somewhere honest to put a permission-
 * flavored HTTP status if one is ever recognized. */
export function classifyFetchReason(reason: ProviderFetchReason): Trading212ErrorCategory {
  switch (reason) {
    case "unauthorized":
      return "AUTHENTICATION";
    case "rate_limited":
      return "RATE_LIMIT";
    case "network_error":
      return "NETWORK";
    case "provider_error":
      return "PROVIDER_ERROR";
    case "malformed_response":
      return "INVALID_RESPONSE";
  }
}

/** For a genuinely unexpected thrown error (a bug, an out-of-memory, a
 * Prisma error) rather than a classified provider fetch failure —
 * everything not already produced by classifyFetchReason lands here. */
export function classifyThrownError(): Trading212ErrorCategory {
  return "INTERNAL";
}

/** Only an AUTHENTICATION failure means the stored credentials themselves
 * are the problem (Trading 212 explicitly rejected them) — every other
 * category is transient/environmental and must NOT flag the connection as
 * needing the user's attention (Requirement 12: "Only classify
 * credentials as invalid when the provider response makes that clear";
 * "Do not automatically disconnect... because of one temporary
 * failure"). PERMISSION is included on the same reasoning (a
 * provider-confirmed access problem, not a transient one) even though
 * it's not reachable from Trading 212 today. */
export function isCredentialInvalidatingCategory(category: Trading212ErrorCategory): boolean {
  return category === "AUTHENTICATION" || category === "PERMISSION";
}
