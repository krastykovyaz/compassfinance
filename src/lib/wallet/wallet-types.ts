// Shared types for the wallet abstraction layer.
// This file has no browser or network calls in it — just the shapes that
// the rest of the wallet layer (and the UI) agree on.

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

export type WalletErrorType =
  | "not-installed"
  | "rejected"
  | "unsupported-chain"
  | "balance-error"
  | "unknown";

export type WalletError = {
  type: WalletErrorType;
  message: string;
};

export type SupportedChain = {
  chainId: number;
  name: string;
  usdcAddress: string;
  usdcDecimals: number;
};

export type WalletState = {
  status: WalletStatus;
  address: string | null;
  chainId: number | null;
  chainName: string | null;
  /** True once connected to a chain outside SUPPORTED_CHAINS — the wallet
   * connection itself is still valid, but USDC balance can't be read (no
   * known token address for that chain). Never affects Hyperliquid account
   * data, which is address-only and chain-agnostic. */
  isUnsupportedChain: boolean;
  usdcBalance: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  isBalanceLoading: boolean;
  error: WalletError | null;
};

export type WalletContextValue = WalletState & {
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
};

// Minimal EIP-1193 provider interface — the same shape MetaMask and other
// injected wallets expose on `window.ethereum`. We intentionally hand-roll
// this instead of pulling in wagmi/viem/ethers to avoid an unnecessary
// dependency for what is, at this stage, a handful of read-only calls.
export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}
