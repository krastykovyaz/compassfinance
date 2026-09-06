import "server-only";
import { fetchTrading212AccountInfo } from "./trading212-client";
import type { BrokerageProvider, ValidateCredentialsResult } from "./brokerage-provider";

/** The Trading 212 BrokerageProvider adapter — validates a real key+secret
 * pair against Trading 212's own API (see trading212-client.ts) and
 * returns the account id it belongs to. This is the ONLY thing Phase 1
 * needs from a provider; getPositions/getTrades/etc. for a future sync
 * phase would be added to BrokerageProvider and implemented here without
 * touching the repository or API routes that already depend on this
 * narrower shape. */
export const trading212Provider: BrokerageProvider = {
  displayName: "Trading 212",
  providerId: "trading212",

  async validateCredentials(credentials: { apiKey: string; apiSecret: string }): Promise<ValidateCredentialsResult> {
    const result = await fetchTrading212AccountInfo(credentials.apiKey, credentials.apiSecret);
    if (!result.ok) {
      return { ok: false, reason: result.reason, message: result.message };
    }
    return { ok: true, externalAccountId: result.data.id };
  },
};
