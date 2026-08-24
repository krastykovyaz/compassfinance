// Universal-link templates for handing a WalletConnect pairing URI off to a
// specific wallet app on mobile. Like SUPPORTED_CHAINS in
// evm-wallet-provider.tsx, this is a curated map of third-party endpoints
// that can go stale if a wallet changes its linking domain — verified
// against each wallet's own docs as of this writing, but re-check if a
// deep link stops working.
//
// Wallets without a confirmed universal-link host (e.g. Rabby's mobile app
// has no publicly documented one) fall back to the raw `wc:` URI, which any
// WalletConnect-compatible wallet can still consume by pasting/scanning it
// inside the app.

export type WalletOption = { id: string; name: string };

export const WALLET_OPTIONS: WalletOption[] = [
  { id: "metamask", name: "MetaMask" },
  { id: "rabby", name: "Rabby Wallet" },
  { id: "coinbase", name: "Coinbase Wallet" },
  { id: "trust", name: "Trust Wallet" },
  { id: "other", name: "Other WalletConnect wallet" },
];

const UNIVERSAL_LINK_HOSTS: Record<string, string> = {
  metamask: "https://metamask.app.link/wc?uri=",
  coinbase: "https://go.cb-w.com/wc?uri=",
  trust: "https://link.trustwallet.com/wc?uri=",
};

export function getWalletDeepLink(walletId: string, uri: string): string {
  const host = UNIVERSAL_LINK_HOSTS[walletId];
  if (!host) return uri; // raw wc: URI — copy/paste or "other wallet" fallback
  return host + encodeURIComponent(uri);
}
