// Hyperliquid Phase 1 config — read-only public market data only. No API
// key, no wallet, no private key: the Info API this integration talks to
// is entirely public. HYPERLIQUID_ENABLED is the single on/off switch;
// every function in service.ts checks it first and returns "unavailable"
// (never mock data) when it's off, so disabling this feature is always a
// safe, structural no-op rather than something that could accidentally
// serve stale or fake data.

const DEFAULT_BASE_URL = "https://api.hyperliquid.xyz/info";
const DEFAULT_TIMEOUT_MS = 10_000;

export function isHyperliquidEnabled(): boolean {
  return process.env.HYPERLIQUID_ENABLED === "true";
}

export function getHyperliquidBaseUrl(): string {
  return process.env.HYPERLIQUID_API_BASE_URL || DEFAULT_BASE_URL;
}

export function getHyperliquidTimeoutMs(): number {
  const configured = Number(process.env.HYPERLIQUID_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}
