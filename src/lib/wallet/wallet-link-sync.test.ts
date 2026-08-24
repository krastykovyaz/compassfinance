import { describe, expect, it } from "vitest";
import { getWalletLinkPayload } from "./wallet-link-sync";

const BASE = {
  sessionStatus: "authenticated",
  isConnected: true,
  address: "0xabc",
  chainId: 1,
  chainName: "Ethereum",
};

describe("getWalletLinkPayload — the wallet -> Hyperliquid-account sync trigger", () => {
  it("returns the address+chain payload when authenticated and connected", () => {
    expect(getWalletLinkPayload(BASE)).toEqual({ address: "0xabc", chain: "Ethereum" });
  });

  it("falls back to the stringified chainId when chainName is unavailable", () => {
    expect(getWalletLinkPayload({ ...BASE, chainName: null })).toEqual({ address: "0xabc", chain: "1" });
  });

  it("returns null when signed out — never syncs an unauthenticated session's wallet", () => {
    expect(getWalletLinkPayload({ ...BASE, sessionStatus: "unauthenticated" })).toBeNull();
  });

  it("returns null while the session is still loading", () => {
    expect(getWalletLinkPayload({ ...BASE, sessionStatus: "loading" })).toBeNull();
  });

  it("returns null when the wallet isn't connected", () => {
    expect(getWalletLinkPayload({ ...BASE, isConnected: false })).toBeNull();
  });

  it("returns null when there's no address yet", () => {
    expect(getWalletLinkPayload({ ...BASE, address: null })).toBeNull();
  });

  it("returns null when neither chainName nor chainId is available", () => {
    expect(getWalletLinkPayload({ ...BASE, chainName: null, chainId: null })).toBeNull();
  });
});
