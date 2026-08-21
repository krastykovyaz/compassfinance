import { describe, expect, it } from "vitest";
import { isAssetLocked } from "./lock-status";

// isAssetLocked is now a thin wrapper around isInvestmentUnlocked (see
// unlocks.ts's getInvestmentAccess) — it no longer maintains its own
// separate "is this asset even gated?" list. isInvestmentUnlocked itself
// is what correctly resolves TRUE for every asset outside the 5-stage
// ladder (tested in unlocks.test.ts); this file just verifies the
// wrapper faithfully inverts whatever it's told.
describe("isAssetLocked", () => {
  it("is locked when the underlying unlock check says false", () => {
    const noneUnlocked = () => false;
    expect(isAssetLocked("nasdaq", noneUnlocked)).toBe(true);
    expect(isAssetLocked("aapl", noneUnlocked)).toBe(true);
  });

  it("is not locked when the underlying unlock check says true", () => {
    const allUnlocked = () => true;
    expect(isAssetLocked("nasdaq", allUnlocked)).toBe(false);
    expect(isAssetLocked("nvda", allUnlocked)).toBe(false);
    // Real free-standing assets (btc, gold, ...) are always UNLOCKED per
    // the real isInvestmentUnlocked — this wrapper just reflects that.
    expect(isAssetLocked("btc", allUnlocked)).toBe(false);
  });
});
