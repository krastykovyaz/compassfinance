import { describe, expect, it } from "vitest";
import { resolveHyperliquidPanelView } from "./hyperliquid-account-panel";

// HyperliquidAccountPanel is a React component and can't be rendered in
// this repo's test setup (no jsdom/@testing-library). resolveHyperliquidPanelView
// is the pure "which branch do we render" decision pulled out of it
// specifically so these transitions are directly testable — mirroring the
// getWalletLinkPayload extraction in wallet-link-sync.tsx.
//
// The "sign-in-required" vs "loading" split is a real regression fix: the
// component used to render the same infinite-looking skeleton for both "a
// fetch is genuinely in flight" and "the wallet is connected but nobody is
// signed in, so this will never resolve on its own."

const BASE = {
  walletStatus: "connected",
  address: "0xabc",
  sessionStatus: "authenticated",
  accountStatus: "ok" as const,
  errorMessage: null as string | null,
};

describe("resolveHyperliquidPanelView", () => {
  it("shows the connect prompt when the wallet itself isn't connected", () => {
    expect(resolveHyperliquidPanelView({ ...BASE, walletStatus: "disconnected", address: null })).toBe(
      "not-connected"
    );
  });

  it("shows the connect prompt when the wallet is connected but address is somehow null", () => {
    expect(resolveHyperliquidPanelView({ ...BASE, address: null })).toBe("not-connected");
  });

  it("shows the disabled message when the Hyperliquid feature flag is off, even with a connected wallet", () => {
    expect(
      resolveHyperliquidPanelView({ ...BASE, accountStatus: "unavailable", errorMessage: "disabled" })
    ).toBe("hyperliquid-disabled");
  });

  it("regression: shows sign-in-required (not an infinite skeleton) when the wallet is connected but the session isn't authenticated", () => {
    expect(
      resolveHyperliquidPanelView({ ...BASE, accountStatus: "disconnected", sessionStatus: "unauthenticated" })
    ).toBe("sign-in-required");
  });

  it("regression: also treats a still-loading session as sign-in-required, not loading — it isn't a fetch in flight", () => {
    expect(resolveHyperliquidPanelView({ ...BASE, accountStatus: "disconnected", sessionStatus: "loading" })).toBe(
      "sign-in-required"
    );
  });

  it("shows loading for a genuinely in-flight fetch while authenticated", () => {
    expect(resolveHyperliquidPanelView({ ...BASE, accountStatus: "loading" })).toBe("loading");
  });

  it("shows loading for the transient initial 'disconnected' tick while authenticated (resolves to loading almost immediately)", () => {
    expect(resolveHyperliquidPanelView({ ...BASE, accountStatus: "disconnected" })).toBe("loading");
  });

  it("shows a retryable error for a real fetch failure", () => {
    expect(resolveHyperliquidPanelView({ ...BASE, accountStatus: "error", errorMessage: "Network error" })).toBe(
      "error"
    );
  });

  it("shows a retryable error for an unavailable account that isn't the disabled-flag case", () => {
    expect(
      resolveHyperliquidPanelView({ ...BASE, accountStatus: "unavailable", errorMessage: "rate limited" })
    ).toBe("error");
  });

  it("shows content for ok/empty once everything has resolved", () => {
    expect(resolveHyperliquidPanelView({ ...BASE, accountStatus: "ok" })).toBe("content");
    expect(resolveHyperliquidPanelView({ ...BASE, accountStatus: "empty" })).toBe("content");
  });
});
