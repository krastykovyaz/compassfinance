// Generic shape every brokerage connection provider implements — see
// trading212-provider.ts for the first (and, for Phase 1, only) concrete
// adapter. Adding IBKR or Robinhood later means writing a new file that
// satisfies this same interface, not touching the repository, API
// routes, or UI that already consume it by this shape.

// Phase 5: "provider_error" is a real, recognized non-2xx response from
// the provider itself (practically always a 5xx) — distinct from
// "malformed_response" (a response we couldn't parse/recognize the shape
// of) specifically because it's the one category worth a bounded retry.
// See trading212-client.ts's own Trading212FetchReason, which this
// mirrors.
export type ProviderFetchReason = "unauthorized" | "network_error" | "malformed_response" | "rate_limited" | "provider_error";

export type ValidateCredentialsResult =
  | { ok: true; externalAccountId: string }
  | { ok: false; reason: ProviderFetchReason; message: string };

// ---------------------------------------------------------------------------
// Phase 2 additions — provider-neutral read shapes for account/position/
// order/dividend/transaction data. These mirror trading212-client.ts's own
// return shapes closely (Trading 212 is still the only implementation),
// but living here — decoupled from any Trading212* type name — is what
// keeps a future IBKR/Robinhood adapter a matter of implementing this same
// interface rather than reshaping the sync service and DB layer around a
// second provider's field names.
// ---------------------------------------------------------------------------

export type ProviderFetchResult<T> = { ok: true; data: T } | { ok: false; reason: ProviderFetchReason; message: string };

export type ProviderPagedResult<T> = { items: T[]; nextCursor: string | null };

export type ProviderAccountSummary = {
  currencyCode?: string;
  totalValue?: number;
  cashAvailable?: number;
  cashInPies?: number;
  cashReserved?: number;
  investedValue?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
};

export type ProviderPosition = {
  externalTicker: string;
  externalName?: string;
  currencyCode?: string;
  quantity: number;
  averagePrice?: number;
  currentPrice?: number;
  unrealizedPnl?: number;
};

export type ProviderOrder = {
  externalId: string;
  externalTicker: string;
  externalName?: string;
  side?: string;
  status?: string;
  quantity?: number;
  filledQuantity?: number;
  /** Per-unit executed price — real or, when only an aggregate exists,
   * mechanically derived from filledValue/filledQuantity (see
   * trading212-client.ts's own note on this Phase 4 fix). */
  fillPrice?: number;
  /** The real, aggregate executed value the provider itself reported —
   * kept distinct from fillPrice, never conflated (Phase 4). */
  filledValue?: number;
  currencyCode?: string;
  externalCreatedAt: string;
};

export type ProviderDividend = {
  externalId: string;
  externalTicker?: string;
  externalName?: string;
  quantity?: number;
  amount: number;
  grossAmountPerShare?: number;
  currencyCode?: string;
  externalCreatedAt: string;
};

export type ProviderTransaction = {
  externalId: string;
  type: string;
  amount: number;
  currencyCode?: string;
  externalCreatedAt: string;
};

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

  /** Everything below takes the ALREADY-DECRYPTED credential pair for a
   * stored connection — only trading212-sync.ts, which reads it via
   * getDecryptedTrading212Credentials, ever calls these. */
  getAccountSummary(credentials: { apiKey: string; apiSecret: string }): Promise<ProviderFetchResult<ProviderAccountSummary>>;
  getPositions(credentials: { apiKey: string; apiSecret: string }): Promise<ProviderFetchResult<ProviderPosition[]>>;
  getOrderHistoryPage(
    credentials: { apiKey: string; apiSecret: string },
    cursor?: string
  ): Promise<ProviderFetchResult<ProviderPagedResult<ProviderOrder>>>;
  getDividendsPage(
    credentials: { apiKey: string; apiSecret: string },
    cursor?: string
  ): Promise<ProviderFetchResult<ProviderPagedResult<ProviderDividend>>>;
  getTransactionsPage(
    credentials: { apiKey: string; apiSecret: string },
    cursor?: string
  ): Promise<ProviderFetchResult<ProviderPagedResult<ProviderTransaction>>>;
}
