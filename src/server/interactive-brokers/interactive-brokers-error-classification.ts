import "server-only";
import {
  classifyFetchReason as classifyTrading212FetchReason,
  classifyThrownError,
  isCredentialInvalidatingCategory,
  type Trading212ErrorCategory,
} from "@/server/trading212/trading212-error-classification";
import type { InteractiveBrokersFetchReason } from "./interactive-brokers-client";

// Reuses Trading 212's error-classification vocabulary and logic wholesale
// (Milestone instruction: "Reuse the existing provider error
// classification from Trading 212 where possible") rather than inventing
// a second category system — AUTHENTICATION/PERMISSION/RATE_LIMIT/
// NETWORK/PROVIDER_ERROR/INVALID_RESPONSE/INTERNAL are already fully
// provider-neutral in name and intent (see trading212-error-
// classification.ts's own header comment), so an IBKR-specific
// implementation only needs to map ITS OWN fetch-reason shape onto that
// same shared vocabulary — not redefine the vocabulary itself.
export type InteractiveBrokersErrorCategory = Trading212ErrorCategory;

/** interactive-brokers-client.ts's InteractiveBrokersFetchReason is a
 * superset of Trading212's ProviderFetchReason (it adds `not_configured`
 * — an IBKR-specific "we don't even have credentials configured" case
 * with no Trading 212 equivalent). Everything else maps through
 * Trading212's own classifier unchanged. */
export function classifyInteractiveBrokersFetchReason(reason: InteractiveBrokersFetchReason): InteractiveBrokersErrorCategory {
  if (reason === "not_configured") {
    // Not a provider rejection and not transient-network — a real
    // configuration gap on CompassFinance's own side. INTERNAL is the
    // correct bucket: never credential-invalidating (isCredentialInvalidatingCategory
    // returns false for it), so a missing-config environment is never
    // mistaken for "the user's IBKR credentials were rejected."
    return "INTERNAL";
  }
  return classifyTrading212FetchReason(reason);
}

export { classifyThrownError, isCredentialInvalidatingCategory };
