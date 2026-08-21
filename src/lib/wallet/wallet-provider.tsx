"use client";

// The only file the UI should ever import from the wallet layer.
// It owns the connection state machine and turns raw EIP-1193 calls (from
// evm-wallet-provider.tsx, and walletconnect-provider.ts for mobile) into a
// small, UI-friendly `useWallet()` hook.
//
// UI components never see window.ethereum, WalletConnect internals, error
// codes, or hex chain ids — they see: status, address, chainName,
// usdcBalance, connect(), connectWalletConnect(), disconnect().
//
// Two transports feed this ONE state machine — there is no second wallet
// state. `wcProvider` below is internal bookkeeping (which transport, if
// any, is currently WalletConnect) — it is never exposed on
// WalletContextValue.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import {
  getApprovedAccounts,
  getChainId,
  getUsdcBalance,
  isSupportedChain,
  isUserRejectedError,
  isWalletAvailable,
  requestAccounts,
  subscribeAccountsChanged,
  subscribeChainChanged,
  subscribeDisconnect,
  SUPPORTED_CHAINS,
} from "./evm-wallet-provider";
import {
  connectWalletConnect as startWalletConnectConnection,
  disconnectWalletConnect as disconnectWalletConnectTransport,
  getRestoredWalletConnectSession,
  isWalletConnectConfigured,
} from "./walletconnect-provider";
import { Eip1193Provider, WalletContextValue, WalletState } from "./wallet-types";

const initialState: WalletState = {
  status: "disconnected",
  address: null,
  chainId: null,
  chainName: null,
  isUnsupportedChain: false,
  usdcBalance: null,
  isConnected: false,
  isConnecting: false,
  isBalanceLoading: false,
  error: null,
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(initialState);
  const [wcProvider, setWcProvider] = useState<Eip1193Provider | null>(null);
  const [walletConnectUri, setWalletConnectUri] = useState<string | null>(null);
  // Guards the race between connectWalletConnect()'s own .connect() promise
  // and the visibilitychange/focus fallback below — whichever settles the
  // attempt first wins, the other becomes a no-op. Also flipped by
  // disconnect() so a modal-close mid-connect can't be raced by a late
  // resolution.
  const settledRef = useRef(false);

  const loadBalance = useCallback(
    async (address: string, chainId: number, provider?: Eip1193Provider | null) => {
      setState((s) => ({ ...s, isBalanceLoading: true }));
      try {
        const balance = await getUsdcBalance(address, chainId, provider);
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
    },
    []
  );

  const applyConnection = useCallback(
    async (address: string, provider?: Eip1193Provider | null) => {
      const chainId = await getChainId(provider);
      const chainName = SUPPORTED_CHAINS[chainId]?.name ?? `Chain ${chainId}`;
      setState((s) => ({
        ...s,
        status: "connected",
        address,
        chainId,
        chainName,
        isUnsupportedChain: !isSupportedChain(chainId),
        isConnected: true,
        isConnecting: false,
        error: null,
      }));
      await loadBalance(address, chainId, provider);
    },
    [loadBalance]
  );

  // Silent reconnect on mount. Injected wallets first (unchanged, standard
  // dApp UX): check for already-approved accounts without prompting. Only
  // if nothing is there, fall back to checking for a restored WalletConnect
  // session (also silent — never opens a new pairing).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isWalletAvailable()) {
        const accounts = await getApprovedAccounts();
        if (cancelled) return;
        if (accounts.length > 0) {
          await applyConnection(accounts[0]);
          return;
        }
      }
      const restored = await getRestoredWalletConnectSession();
      if (cancelled || !restored) return;
      setWcProvider(restored.provider);
      await applyConnection(restored.address, restored.provider);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-sync with injected-wallet-initiated changes (switching
  // accounts/networks in the wallet UI, or the wallet disconnecting
  // itself). Unconditional — unchanged from the injected-only design.
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
        return { ...s, chainId, chainName, isUnsupportedChain: !isSupportedChain(chainId) };
      });
    });
    const unsubDisconnect = subscribeDisconnect(() => setState(initialState));

    return () => {
      unsubAccounts();
      unsubChain();
      unsubDisconnect();
    };
  }, [applyConnection]);

  // Live-sync with WalletConnect-initiated changes. Separate from (and
  // additive to) the injected effect above — only active while a
  // WalletConnect session is the current transport.
  useEffect(() => {
    if (!wcProvider) return;

    const unsubAccounts = subscribeAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setWcProvider(null);
        setState(initialState);
      } else {
        applyConnection(accounts[0], wcProvider);
      }
    }, wcProvider);
    const unsubChain = subscribeChainChanged((chainId) => {
      setState((s) => {
        if (!s.address) return s;
        const chainName = SUPPORTED_CHAINS[chainId]?.name ?? `Chain ${chainId}`;
        return { ...s, chainId, chainName, isUnsupportedChain: !isSupportedChain(chainId) };
      });
    }, wcProvider);
    const unsubDisconnect = subscribeDisconnect(() => {
      setWcProvider(null);
      setState(initialState);
    }, wcProvider);

    return () => {
      unsubAccounts();
      unsubChain();
      unsubDisconnect();
    };
  }, [wcProvider, applyConnection]);

  // Re-fetch balance whenever the connected chain changes (chainChanged
  // above updates chainId but doesn't know the new balance yet).
  useEffect(() => {
    if (state.address && state.chainId) {
      loadBalance(state.address, state.chainId, wcProvider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.chainId]);

  // Fallback for mobile Safari suspending the tab's relay connection while
  // the user approves in their wallet app: on returning to the tab, check
  // whether a session was actually established even though the .connect()
  // promise in connectWalletConnect() hasn't resolved yet (or won't, if the
  // suspended promise never gets to run). Scoped to an in-flight attempt
  // only (a pairing URI has been issued but not yet settled).
  useEffect(() => {
    if (walletConnectUri === null) return;

    const checkForApproval = async () => {
      if (settledRef.current) return;
      const restored = await getRestoredWalletConnectSession();
      if (settledRef.current || !restored) return;
      settledRef.current = true;
      setWalletConnectUri(null);
      setWcProvider(restored.provider);
      await applyConnection(restored.address, restored.provider);
    };

    document.addEventListener("visibilitychange", checkForApproval);
    window.addEventListener("focus", checkForApproval);
    return () => {
      document.removeEventListener("visibilitychange", checkForApproval);
      window.removeEventListener("focus", checkForApproval);
    };
  }, [walletConnectUri, applyConnection]);

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
      // Connecting via injected supersedes any prior WalletConnect session.
      if (wcProvider) {
        disconnectWalletConnectTransport(wcProvider);
        setWcProvider(null);
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
  }, [applyConnection, wcProvider]);

  const connectWalletConnect = useCallback(async () => {
    if (!isWalletConnectConfigured()) return;

    settledRef.current = false;
    setWalletConnectUri(null);
    setState((s) => ({ ...s, status: "connecting", isConnecting: true, error: null }));

    try {
      const { provider, address } = await startWalletConnectConnection((uri) => {
        setWalletConnectUri(uri);
      });
      if (settledRef.current) return; // the visibility fallback already handled this attempt
      settledRef.current = true;
      setWalletConnectUri(null);
      setWcProvider(provider);
      await applyConnection(address, provider);
    } catch (err) {
      if (settledRef.current) return;
      settledRef.current = true;
      setWalletConnectUri(null);
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
              : "Couldn't connect via WalletConnect.",
        },
      }));
    }
  }, [applyConnection]);

  // Injected wallets (MetaMask etc.) don't expose a programmatic disconnect —
  // only the wallet itself can fully revoke a site's permission. What a dApp
  // can do, and what this does for that transport, is forget the connection
  // locally. WalletConnect sessions DO support a real disconnect, so those
  // get torn down on the relay too. Also doubles as "cancel" for a pending
  // WalletConnect attempt (e.g. the connect modal's close button) — it
  // settles the race guard so a late .connect() resolution or fallback
  // check becomes a no-op.
  const disconnect = useCallback(() => {
    settledRef.current = true;
    setWalletConnectUri(null);
    if (wcProvider) {
      disconnectWalletConnectTransport(wcProvider);
      setWcProvider(null);
    }
    setState(initialState);
  }, [wcProvider]);

  const refreshBalance = useCallback(async () => {
    if (state.address && state.chainId) {
      await loadBalance(state.address, state.chainId, wcProvider);
    }
  }, [state.address, state.chainId, wcProvider, loadBalance]);

  const value = useMemo<WalletContextValue>(
    () => ({
      ...state,
      connect,
      disconnect,
      refreshBalance,
      connectWalletConnect,
      walletConnectUri,
      isWalletConnectAvailable: isWalletConnectConfigured(),
    }),
    [state, connect, disconnect, refreshBalance, connectWalletConnect, walletConnectUri]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
