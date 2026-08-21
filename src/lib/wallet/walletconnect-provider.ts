// WalletConnect v2 transport — the second way to reach the exact same
// wallet state as evm-wallet-provider.tsx's injected transport. This file
// is the ONLY place that touches @walletconnect/ethereum-provider directly;
// wallet-provider.tsx never imports the SDK itself, mirroring the existing
// injected-provider indirection.
//
// Like evm-wallet-provider.tsx, this module never requests, stores, or has
// access to a private key or seed phrase. WalletConnect's relay only ever
// carries signature requests to the user's wallet app — the wallet app
// signs, this app never sees a key. This file only ever reads account and
// session state (via `.accounts`, `.session`) — it invokes no message- or
// transaction-signing RPC method of any kind.

import { Eip1193Provider } from "./wallet-types";
import { SUPPORTED_CHAINS } from "./evm-wallet-provider";

type WalletConnectProvider = Eip1193Provider & {
  connect: (opts?: { optionalChains?: number[] }) => Promise<void>;
  disconnect: () => Promise<void>;
  accounts: string[];
  session?: unknown;
};

function getProjectId(): string | null {
  const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  return id && id.length > 0 ? id : null;
}

export function isWalletConnectConfigured(): boolean {
  return getProjectId() !== null;
}

// Lazy singleton — memoizes the in-flight init PROMISE (not just the
// eventual resolved value) so two callers racing to connect at the same
// time share one init instead of double-initializing the SDK.
let providerPromise: Promise<WalletConnectProvider> | null = null;

export function getWalletConnectProvider(): Promise<WalletConnectProvider> {
  if (providerPromise) return providerPromise;

  const projectId = getProjectId();
  if (!projectId) {
    return Promise.reject(new Error("WalletConnect is not configured"));
  }

  providerPromise = import("@walletconnect/ethereum-provider").then(({ EthereumProvider }) =>
    EthereumProvider.init({
      projectId,
      showQrModal: false,
      // SUPPORTED_CHAINS always has entries, so this cast is safe — the SDK's
      // types require a statically-known-non-empty tuple here.
      optionalChains: Object.keys(SUPPORTED_CHAINS).map(Number) as [number, ...number[]],
      metadata: {
        name: "CompassFinance",
        description: "CompassFinance — learn investing, then connect a real wallet",
        url: typeof window !== "undefined" ? window.location.origin : "https://compassfinance.online",
        icons: [],
      },
    })
  ) as Promise<WalletConnectProvider>;

  return providerPromise;
}

// Checks for an already-approved WalletConnect session WITHOUT prompting
// the user or opening a new pairing — the WalletConnect analogue of
// evm-wallet-provider.tsx's getApprovedAccounts(). Initializing the SDK
// does not itself open a relay connection unless a persisted session
// already exists, so this is safe to call unconditionally on mount.
export async function getRestoredWalletConnectSession(): Promise<{
  provider: WalletConnectProvider;
  address: string;
} | null> {
  try {
    const provider = await getWalletConnectProvider();
    if (provider.session && provider.accounts.length > 0) {
      return { provider, address: provider.accounts[0] };
    }
    return null;
  } catch {
    return null;
  }
}

// Starts a fresh WalletConnect pairing. `onUri` fires as soon as the
// pairing URI is available (render it as a QR code / deep link); the
// returned promise resolves once the user approves in their wallet app.
export async function connectWalletConnect(
  onUri: (uri: string) => void
): Promise<{ provider: WalletConnectProvider; address: string }> {
  const provider = await getWalletConnectProvider();

  const handleDisplayUri = (uri: string) => onUri(uri);
  provider.on("display_uri", handleDisplayUri as (...args: unknown[]) => void);

  try {
    await provider.connect();
  } finally {
    provider.removeListener("display_uri", handleDisplayUri as (...args: unknown[]) => void);
  }

  const address = provider.accounts[0];
  if (!address) throw new Error("No account was returned by the wallet.");
  return { provider, address };
}

export async function disconnectWalletConnect(provider: Eip1193Provider): Promise<void> {
  const wc = provider as WalletConnectProvider;
  try {
    await wc.disconnect();
  } catch {
    // Best-effort — local state reset happens regardless of relay teardown.
  }
}
