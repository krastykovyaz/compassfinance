import { describe, expect, it } from "vitest";
import { getWalletDeepLink, WALLET_OPTIONS } from "./walletconnect-deep-links";

const URI = "wc:abc123@2?relay-protocol=irn&symKey=deadbeef";

describe("getWalletDeepLink", () => {
  it("builds a universal link with the URI-encoded pairing URI for MetaMask", () => {
    expect(getWalletDeepLink("metamask", URI)).toBe(
      `https://metamask.app.link/wc?uri=${encodeURIComponent(URI)}`
    );
  });

  it("builds a universal link for Coinbase Wallet", () => {
    expect(getWalletDeepLink("coinbase", URI)).toBe(
      `https://go.cb-w.com/wc?uri=${encodeURIComponent(URI)}`
    );
  });

  it("builds a universal link for Trust Wallet", () => {
    expect(getWalletDeepLink("trust", URI)).toBe(
      `https://link.trustwallet.com/wc?uri=${encodeURIComponent(URI)}`
    );
  });

  it("falls back to the raw wc: URI for a wallet with no known universal-link host (e.g. Rabby, or 'other')", () => {
    expect(getWalletDeepLink("rabby", URI)).toBe(URI);
    expect(getWalletDeepLink("other", URI)).toBe(URI);
  });

  it("falls back to the raw URI for an unrecognized wallet id", () => {
    expect(getWalletDeepLink("not-a-real-wallet", URI)).toBe(URI);
  });

  it("every WALLET_OPTIONS entry has a non-empty id and name", () => {
    for (const wallet of WALLET_OPTIONS) {
      expect(wallet.id.length).toBeGreaterThan(0);
      expect(wallet.name.length).toBeGreaterThan(0);
    }
  });
});
