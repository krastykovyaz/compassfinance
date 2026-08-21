"use client";

// The only file the UI should ever import from the wallet layer.
// It owns the connection state machine and turns raw EIP-1193 calls (from
// evm-wallet-provider.tsx) into a small, UI-friendly `useWallet()` hook.
//
// UI components never see window.ethereum, error codes, or hex chain ids —
// they see: status, address, chainName, usdcBalance, connect(), disconnect().

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import {
  getApprovedAccounts,
  getChainId,
  getUsdcBalance,
  isUserRejectedError,
  isWalletAvailable,
  requestAccounts,
  subscribeAccountsChanged,
  subscribeChainChanged,
  subscribeDisconnect,
  SUPPORTED_CHAINS,
} from "./evm-wallet-provider";
import { WalletContextValue, WalletState } from "./wallet-types";

const initialState: WalletState = {
  status: "disconnected",
  address: null,
  chainId: null,
  chainName: null,
  usdcBalance: null,
  isConnected: false,
  isConnecting: false,
  isBalanceLoading: false,
  error: null,
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(initialState);

  const loadBalance = useCallback(async (address: string, chainId: number) => {
    setState((s) => ({ ...s, isBalanceLoading: true }));
    try {
      const balance = await getUsdcBalance(address, chainId);
      setState((s) => ({ ...s, usdcBalance: balance, isBalanceLoading: false }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isBalanceLoading: false,
        error: {
          type: "balance-error",
          message: err instanceof Error ? err.message : "Couldn't load USDC balance",
        },
      }));
    }
  }, []);

  const applyConnection = useCallback(
    async (address: string) => {
      const chainId = await getChainId();
      const chainName = SUPPORTED_CHAINS[chainId]?.name ?? `Chain ${chainId}`;
      setState((s) => ({
        ...s,
        status: "connected",
        address,
        chainId,
        chainName,
        isConnected: true,
        isConnecting: false,
        error: null,
      }));
      await loadBalance(address, chainId);
    },
    [loadBalance]
  );

  // Silent reconnect on mount: check for already-approved accounts without
  // prompting. Standard dApp UX so returning users don't reconnect every visit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isWalletAvailable()) return;
      const accounts = await getApprovedAccounts();
      if (cancelled || accounts.length === 0) return;
      await applyConnection(accounts[0]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-sync with wallet-initiated changes (switching accounts/networks in
  // the wallet UI, or the wallet disconnecting itself).
  useEffect(() => {
    const unsubAccounts = subscribeAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setState(initialState);
      } else {
        applyConnection(accounts[0]);
      }
    });
    const unsubChain = subscribeChainChanged((chainId) => {
      setState((s) => {
        if (!s.address) return s;
        const chainName = SUPPORTED_CHAINS[chainId]?.name ?? `Chain ${chainId}`;
        return { ...s, chainId, chainName };
      });
    });
    const unsubDisconnect = subscribeDisconnect(() => setState(initialState));

    return () => {
      unsubAccounts();
      unsubChain();
      unsubDisconnect();
    };
  }, [applyConnection]);

  // Re-fetch balance whenever the connected chain changes (chainChanged
  // above updates chainId but doesn't know the new balance yet).
  useEffect(() => {
    if (state.address && state.chainId) {
      loadBalance(state.address, state.chainId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.chainId]);

  const connect = useCallback(async () => {
    if (!isWalletAvailable()) {
      setState((s) => ({
        ...s,
        status: "error",
        error: {
          type: "not-installed",
          message: "No EVM wallet found. Install MetaMask or another injected wallet.",
        },
      }));
      return;
    }

    setState((s) => ({ ...s, status: "connecting", isConnecting: true, error: null }));

    try {
      const accounts = await requestAccounts();
      if (accounts.length === 0) {
        setState((s) => ({
          ...s,
          status: "disconnected",
          isConnecting: false,
          error: { type: "unknown", message: "No account was returned by the wallet." },
        }));
        return;
      }
      await applyConnection(accounts[0]);
    } catch (err) {
      setState((s) => ({
        ...s,
        status: isUserRejectedError(err) ? "disconnected" : "error",
        isConnecting: false,
        error: {
          type: isUserRejectedError(err) ? "rejected" : "unknown",
          message: isUserRejectedError(err)
            ? "Connection request was rejected."
            : err instanceof Error
              ? err.message
              : "Couldn't connect to wallet.",
        },
      }));
    }
  }, [applyConnection]);

  // Injected wallets (MetaMask etc.) don't expose a programmatic disconnect —
  // only the wallet itself can fully revoke a site's permission. What a dApp
  // can do, and what this does, is forget the connection locally.
  const disconnect = useCallback(() => {
    setState(initialState);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (state.address && state.chainId) {
      await loadBalance(state.address, state.chainId);
    }
  }, [state.address, state.chainId, loadBalance]);

  const value = useMemo<WalletContextValue>(
    () => ({ ...state, connect, disconnect, refreshBalance }),
    [state, connect, disconnect, refreshBalance]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
