// Hyperliquid config. HYPERLIQUID_ENABLED is the single on/off switch for
// the whole integration; every function in service.ts checks it first and
// returns "unavailable" (never mock data) when it's off, so disabling this
// feature is always a safe, structural no-op rather than something that
// could accidentally serve stale or fake data.
//
// Phase 4 added real order submission (POST /exchange) — this module never
// sees, stores, or requests a private key or signature material itself
// (every signature is produced client-side, inside the user's own wallet,
// before anything reaches the server); it only knows which URLs to relay
// an already-signed action to and whether that's mainnet or testnet.

const DEFAULT_INFO_URL = "https://api.hyperliquid.xyz/info";
const DEFAULT_TESTNET_INFO_URL = "https://api.hyperliquid-testnet.xyz/info";
const DEFAULT_EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";
const DEFAULT_TESTNET_EXCHANGE_URL = "https://api.hyperliquid-testnet.xyz/exchange";
const DEFAULT_TIMEOUT_MS = 10_000;

export function isHyperliquidEnabled(): boolean {
  return process.env.HYPERLIQUID_ENABLED === "true";
}

// Testnet is a fully separate account/balance universe from mainnet — this
// must gate BOTH the read (/info) and write (/exchange) base URLs together,
// never just one, or the UI would show one network's balance while trading
// against the other. Defaults to mainnet; never silently defaults to
// testnet.
export function isHyperliquidTestnet(): boolean {
  return process.env.HYPERLIQUID_NETWORK === "testnet";
}

export function getHyperliquidBaseUrl(): string {
  if (process.env.HYPERLIQUID_API_BASE_URL) return process.env.HYPERLIQUID_API_BASE_URL;
  return isHyperliquidTestnet() ? DEFAULT_TESTNET_INFO_URL : DEFAULT_INFO_URL;
}

export function getHyperliquidExchangeUrl(): string {
  if (process.env.HYPERLIQUID_EXCHANGE_URL) return process.env.HYPERLIQUID_EXCHANGE_URL;
  return isHyperliquidTestnet() ? DEFAULT_TESTNET_EXCHANGE_URL : DEFAULT_EXCHANGE_URL;
}

export function getHyperliquidTimeoutMs(): number {
  const configured = Number(process.env.HYPERLIQUID_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}
