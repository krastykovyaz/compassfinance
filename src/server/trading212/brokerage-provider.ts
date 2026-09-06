// Generic shape every brokerage connection provider implements — see
// trading212-provider.ts for the first (and, for Phase 1, only) concrete
// adapter. Adding IBKR or Robinhood later means writing a new file that
// satisfies this same interface, not touching the repository, API
// routes, or UI that already consume it by this shape.

export type ValidateCredentialsResult =
  | { ok: true; externalAccountId: string }
  | { ok: false; reason: "unauthorized" | "network_error" | "malformed_response" | "rate_limited"; message: string };

export interface BrokerageProvider {
  /** Human-readable name for UI copy (e.g. "Trading 212"). */
  readonly displayName: string;
  /** The `provider` string stored on BrokerageConnection rows (e.g. "trading212"). */
  readonly providerId: string;
  /** Calls the real brokerage API with caller-supplied, not-yet-stored
   * credentials and confirms they authenticate AND identify a specific
   * account. Never persists anything itself — the caller decides whether
   * to store based on this result (see trading212-repository.ts). */
  validateCredentials(credentials: { apiKey: string; apiSecret: string }): Promise<ValidateCredentialsResult>;
}
