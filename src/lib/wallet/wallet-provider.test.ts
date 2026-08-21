import { describe, expect, it } from "vitest";
import { balanceLoadedState, balanceLoadFailedState } from "./wallet-provider";
import { WalletState } from "./wallet-types";

// wallet-provider.tsx's WalletProvider is a real React hook (useState/
// useEffect) and can't be rendered in this repo's test setup (Vitest runs
// in plain Node — no jsdom, no @testing-library, and vitest.config.mts
// only picks up **/*.test.ts, not .tsx). balanceLoadedState/
// balanceLoadFailedState are the pure state-transition functions pulled
// out of loadBalance() specifically so the regression below is directly
// testable without a renderer — mirroring the getWalletLinkPayload
// extraction in wallet-link-sync.tsx.

const CONNECTED: WalletState = {
  status: "connected",
  address: "0xabc",
  chainId: 1,
  chainName: "Ethereum",
  isUnsupportedChain: false,
  usdcBalance: null,
  isConnected: true,
  isConnecting: false,
  isBalanceLoading: true,
  error: null,
};

describe("balanceLoadedState / balanceLoadFailedState — the loadBalance() state transitions", () => {
  it("a successful load sets the balance and clears isBalanceLoading", () => {
    const next = balanceLoadedState(CONNECTED, 12.5);
    expect(next.usdcBalance).toBe(12.5);
    expect(next.isBalanceLoading).toBe(false);
    expect(next.error).toBeNull();
  });

  it("regression: a successful load clears a STALE error from an earlier failed attempt — the UI must never show a live balance next to a leftover error banner", () => {
    const withStaleError: WalletState = {
      ...CONNECTED,
      error: { type: "balance-error", message: "No injected wallet found" },
    };

    const next = balanceLoadedState(withStaleError, 0);

    expect(next.usdcBalance).toBe(0);
    expect(next.error).toBeNull();
  });

  it("a failed load sets a balance-error without touching address/status/chain", () => {
    const next = balanceLoadFailedState(CONNECTED, "No injected wallet found");
    expect(next.error).toEqual({ type: "balance-error", message: "No injected wallet found" });
    expect(next.isBalanceLoading).toBe(false);
    expect(next.status).toBe("connected");
    expect(next.address).toBe("0xabc");
  });

  it("a failed load after a previously successful one still reports the new error (failure must not be silently swallowed)", () => {
    const previouslyOk: WalletState = { ...CONNECTED, usdcBalance: 42, error: null };
    const next = balanceLoadFailedState(previouslyOk, "Network error");
    expect(next.error?.message).toBe("Network error");
    // The last-known-good balance is intentionally left in place — only
    // the error/loading flags change, so the UI can still show a stale-but-
    // real number alongside a visible, honest error instead of blanking it.
    expect(next.usdcBalance).toBe(42);
  });
});
