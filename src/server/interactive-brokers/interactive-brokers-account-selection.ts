import "server-only";
import type { InteractiveBrokersPortfolioAccount } from "./interactive-brokers-client";

// Pure account-selection decision logic (no I/O) — deliberately separate
// from interactive-brokers-sync.ts so it's directly unit-testable without
// mocking Prisma or the IBKR client, and reusable by both the sync engine
// and the account-selection API route (which re-validates a user's choice
// against a fresh discovery call before persisting it).
//
// Milestone 21's explicit requirement: ONE active IBKR account per
// BrokerageConnection, never silently chosen by array order when more
// than one is available. This function is the single place that
// implements that decision:
//   - No discovered accounts at all → `no_accounts` (a real, surfaced
//     failure — "no accounts returned" per the error-handling checklist).
//   - Exactly one discovered account → auto-selected, no user input
//     needed (the common case).
//   - A previously-selected account that is STILL among the discovered
//     accounts → re-selected as-is, even if others are now also visible —
//     "preserve the selected account when it is still valid" on a
//     re-sync, rather than re-prompting every time.
//   - Otherwise (multiple discovered, and no still-valid prior selection —
//     either this is the very first sync, or the previously selected
//     account disappeared) → `needs_selection`, surfacing every
//     candidate so the minimal account-selection UI/API can ask the user
//     once, rather than guessing.

export type InteractiveBrokersAccountSelection =
  | { kind: "selected"; accountId: string }
  | { kind: "needs_selection"; accounts: InteractiveBrokersPortfolioAccount[] }
  | { kind: "no_accounts" };

export function selectInteractiveBrokersAccount(
  discoveredAccounts: InteractiveBrokersPortfolioAccount[],
  previouslySelectedAccountId: string | null
): InteractiveBrokersAccountSelection {
  if (discoveredAccounts.length === 0) {
    return { kind: "no_accounts" };
  }
  if (previouslySelectedAccountId && discoveredAccounts.some((a) => a.accountId === previouslySelectedAccountId)) {
    return { kind: "selected", accountId: previouslySelectedAccountId };
  }
  if (discoveredAccounts.length === 1) {
    return { kind: "selected", accountId: discoveredAccounts[0].accountId };
  }
  return { kind: "needs_selection", accounts: discoveredAccounts };
}
