// Concrete implementation of "talk to an injected EVM wallet" (MetaMask and
// anything else that injects window.ethereum per EIP-1193).
//
// This file is the ONLY place that touches window.ethereum directly. The
// provider/hook in wallet-provider.tsx never calls window.ethereum itself —
// it only calls the functions exported here. That indirection is what lets
// us swap this out later (e.g. for WalletConnect, or a Hyperliquid-specific
// signer) without touching any UI code.
//
// This module never requests, stores, or has access to a private key or
// seed phrase. Every call below is a permission request
// (eth_requestAccounts), a read-only call (eth_chainId, eth_call), or —
// added for Phase 4 real order execution — a single typed-data SIGNING
// request (eth_signTypedData_v4). That RPC method never exposes a private
// key to this app either: the wallet extension/app performs the actual
// cryptographic signing internally and returns only the resulting
// signature, after the user reviews and approves the exact message in
// their own wallet's UI — this app supplies the message, never the key.

import { Eip1193Provider, SupportedChain } from "./wallet-types";

// USDC contract addresses for the EVM chains we support out of the box.
// Extending this list is how you add support for another network — nothing
// else in the wallet layer needs to change.
export const SUPPORTED_CHAINS: Record<number, SupportedChain> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcDecimals: 6,
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcDecimals: 6,
  },
  8453: {
    chainId: 8453,
    name: "Base",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDecimals: 6,
  },
  10: {
    chainId: 10,
    name: "Optimism",
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    usdcDecimals: 6,
  },
  137: {
    chainId: 137,
    name: "Polygon",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    usdcDecimals: 6,
  },
};

export function isSupportedChain(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS;
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function isWalletAvailable(): boolean {
  return getInjectedProvider() !== null;
}

// Error shape thrown by EIP-1193 providers on user rejection etc.
type ProviderRpcError = { code: number; message: string };

function isProviderRpcError(err: unknown): err is ProviderRpcError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "number"
  );
}

export function isUserRejectedError(err: unknown): boolean {
  // 4001 is the standard EIP-1193 "user rejected the request" code.
  return isProviderRpcError(err) && err.code === 4001;
}

// Prompts the wallet's connect UI. Only resolves with accounts the user has
// explicitly approved for this site.
export async function requestAccounts(): Promise<string[]> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No injected wallet found");
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  return accounts;
}

// Reads already-approved accounts WITHOUT prompting the user. Used on page
// load so a returning user doesn't have to reconnect every visit.
export async function getApprovedAccounts(): Promise<string[]> {
  const provider = getInjectedProvider();
  if (!provider) return [];
  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    return accounts;
  } catch {
    return [];
  }
}

// `explicitProvider` is `Eip1193Provider | null | undefined` at call sites —
// wallet-provider.tsx's `wcProvider` state is `null` (not `undefined`) for
// an injected connection, and a default *parameter* only fires on
// `undefined`. Falling back with `??` in the body (instead of a default
// parameter) means both "omitted" and "explicitly null" correctly resolve
// to the injected provider, instead of null silently bypassing the
// fallback and producing a false "No injected wallet found".
export async function getChainId(explicitProvider?: Eip1193Provider | null): Promise<number> {
  const provider = explicitProvider ?? getInjectedProvider();
  if (!provider) throw new Error("No injected wallet found");
  const hex = (await provider.request({ method: "eth_chainId" })) as string;
  return parseInt(hex, 16);
}

// Encodes and sends an ERC-20 balanceOf(address) call via eth_call — a
// read-only RPC call, no signature or gas required.
export async function getUsdcBalance(
  address: string,
  chainId: number,
  explicitProvider?: Eip1193Provider | null
): Promise<number | null> {
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) return null; // unsupported network — caller decides how to show this

  const provider = explicitProvider ?? getInjectedProvider();
  if (!provider) throw new Error("No injected wallet found");

  const selector = "0x70a08231"; // balanceOf(address)
  const paddedAddress = address.toLowerCase().replace("0x", "").padStart(64, "0");
  const data = selector + paddedAddress;

  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: chain.usdcAddress, data }, "latest"],
  })) as string;

  if (!result || result === "0x") return 0;

  const raw = BigInt(result);
  const divisor = BigInt(10) ** BigInt(chain.usdcDecimals);
  // Keep two decimal places of precision without pulling in a bignumber lib.
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const fractional = Number(remainder) / Number(divisor);
  return Number(whole) + fractional;
}

export function subscribeAccountsChanged(
  cb: (accounts: string[]) => void,
  explicitProvider?: Eip1193Provider | null
): () => void {
  const provider = explicitProvider ?? getInjectedProvider();
  if (!provider) return () => {};
  const handler = (...args: unknown[]) => cb(args[0] as string[]);
  provider.on("accountsChanged", handler);
  return () => provider.removeListener("accountsChanged", handler);
}

// Real, reproduced bug (2026-08-27): a WalletConnect session's
// `chainChanged` event delivered the chain id as a plain decimal value
// (e.g. the number/string `43114` for Avalanche C-Chain) rather than the
// hex-prefixed string ("0xa86a") EIP-1193's spec describes — this varies
// across real provider implementations, unlike the standalone
// `eth_chainId` RPC method (see getChainId below), whose response format
// IS reliably always hex per the JSON-RPC spec. Blindly parsing every
// chainChanged payload as hex silently corrupted the tracked chain id
// (`parseInt("43114", 16)` = 274708, a nonexistent chain) — invisibly
// wrong everywhere that value was later trusted, including the
// signatureChainId used for real Hyperliquid signing. Handles both
// shapes instead of assuming one.
function parseChainChangedPayload(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const str = String(raw);
  return str.startsWith("0x") || str.startsWith("0X") ? parseInt(str, 16) : parseInt(str, 10);
}

export function subscribeChainChanged(
  cb: (chainId: number) => void,
  explicitProvider?: Eip1193Provider | null
): () => void {
  const provider = explicitProvider ?? getInjectedProvider();
  if (!provider) return () => {};
  const handler = (...args: unknown[]) => cb(parseChainChangedPayload(args[0]));
  provider.on("chainChanged", handler);
  return () => provider.removeListener("chainChanged", handler);
}

export function subscribeDisconnect(
  cb: () => void,
  explicitProvider?: Eip1193Provider | null
): () => void {
  const provider = explicitProvider ?? getInjectedProvider();
  if (!provider) return () => {};
  const handler = () => cb();
  provider.on("disconnect", handler);
  return () => provider.removeListener("disconnect", handler);
}

// The standard EIP712Domain field list — every eth_signTypedData_v4
// payload must declare it under `types`, derived from whichever domain
// fields are actually present (a domain with no `verifyingContract`, for
// instance, must not declare that field either, or wallets reject the
// payload as malformed).
const EIP712_DOMAIN_TYPE_FIELDS: Record<string, string> = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32",
};

function eip712DomainType(domain: Record<string, unknown>): { name: string; type: string }[] {
  return Object.keys(domain)
    .filter((key) => key in EIP712_DOMAIN_TYPE_FIELDS)
    .map((key) => ({ name: key, type: EIP712_DOMAIN_TYPE_FIELDS[key] }));
}

// Requests an EIP-712 typed-data signature (eth_signTypedData_v4) — the
// standard, universally-supported wallet method for signing a structured
// message without broadcasting a transaction (no gas, nothing moves). Used
// by hyperliquid-order-signer.ts to get the wallet to sign a Hyperliquid
// order/leverage action; this function itself has no idea what the
// message means, it only relays it to the wallet and returns the
// resulting signature. Pops the wallet's own signing UI every time — the
// user reviews and explicitly approves each one; there is no way to skip
// or batch-approve this from application code.
export async function signTypedData(
  address: string,
  domain: Record<string, unknown>,
  types: Record<string, readonly { name: string; type: string }[]>,
  primaryType: string,
  message: Record<string, unknown>,
  explicitProvider?: Eip1193Provider | null
): Promise<string> {
  const provider = explicitProvider ?? getInjectedProvider();
  if (!provider) throw new Error("No injected wallet found");

  const payload = JSON.stringify({
    domain,
    types: { EIP712Domain: eip712DomainType(domain), ...types },
    primaryType,
    message,
  });

  const signature = (await provider.request({
    method: "eth_signTypedData_v4",
    params: [address, payload],
  })) as string;
  return signature;
}
