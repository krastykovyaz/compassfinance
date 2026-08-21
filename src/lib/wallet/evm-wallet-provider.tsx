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
// seed phrase — every call below is either a permission request
// (eth_requestAccounts) or a read-only call (eth_chainId, eth_call).

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

export async function getChainId(): Promise<number> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No injected wallet found");
  const hex = (await provider.request({ method: "eth_chainId" })) as string;
  return parseInt(hex, 16);
}

// Encodes and sends an ERC-20 balanceOf(address) call via eth_call — a
// read-only RPC call, no signature or gas required.
export async function getUsdcBalance(
  address: string,
  chainId: number
): Promise<number | null> {
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) return null; // unsupported network — caller decides how to show this

  const provider = getInjectedProvider();
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
  cb: (accounts: string[]) => void
): () => void {
  const provider = getInjectedProvider();
  if (!provider) return () => {};
  const handler = (...args: unknown[]) => cb(args[0] as string[]);
  provider.on("accountsChanged", handler);
  return () => provider.removeListener("accountsChanged", handler);
}

export function subscribeChainChanged(cb: (chainId: number) => void): () => void {
  const provider = getInjectedProvider();
  if (!provider) return () => {};
  const handler = (...args: unknown[]) => cb(parseInt(args[0] as string, 16));
  provider.on("chainChanged", handler);
  return () => provider.removeListener("chainChanged", handler);
}

export function subscribeDisconnect(cb: () => void): () => void {
  const provider = getInjectedProvider();
  if (!provider) return () => {};
  const handler = () => cb();
  provider.on("disconnect", handler);
  return () => provider.removeListener("disconnect", handler);
}
