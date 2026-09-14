import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { selectInteractiveBrokersAccount } from "./interactive-brokers-account-selection";
import type { InteractiveBrokersPortfolioAccount } from "./interactive-brokers-client";

function account(accountId: string): InteractiveBrokersPortfolioAccount {
  return { accountId, currency: "USD", type: "LIVE", clearingStatus: "O", accountTitle: null, accountAlias: null };
}

describe("selectInteractiveBrokersAccount", () => {
  it("returns no_accounts when discovery returned nothing", () => {
    expect(selectInteractiveBrokersAccount([], null)).toEqual({ kind: "no_accounts" });
  });

  it("auto-selects the single discovered account with no prior selection", () => {
    expect(selectInteractiveBrokersAccount([account("U1")], null)).toEqual({ kind: "selected", accountId: "U1" });
  });

  it("SECURITY: never silently picks an account by array order when multiple are discovered with no valid prior selection", () => {
    const result = selectInteractiveBrokersAccount([account("U1"), account("U2")], null);
    expect(result.kind).toBe("needs_selection");
    if (result.kind === "needs_selection") {
      expect(result.accounts.map((a) => a.accountId)).toEqual(["U1", "U2"]);
    }
  });

  it("re-selects the previously chosen account when it is still among the discovered accounts, even with others present", () => {
    expect(selectInteractiveBrokersAccount([account("U1"), account("U2")], "U2")).toEqual({ kind: "selected", accountId: "U2" });
  });

  it("falls back to needs_selection when the previously selected account has disappeared and multiple others remain", () => {
    const result = selectInteractiveBrokersAccount([account("U1"), account("U2")], "U9-gone");
    expect(result.kind).toBe("needs_selection");
  });

  it("auto-selects the sole remaining account when the previously selected account disappeared and only one other is left", () => {
    expect(selectInteractiveBrokersAccount([account("U1")], "U9-gone")).toEqual({ kind: "selected", accountId: "U1" });
  });
});
