import { describe, expect, it } from "vitest";
import { applyFavoriteToggle, withId, withoutId } from "./optimistic";

describe("withId / withoutId", () => {
  it("adds an id without mutating the original set", () => {
    const original = new Set(["aapl"]);
    const next = withId(original, "btc");
    expect(next.has("btc")).toBe(true);
    expect(original.has("btc")).toBe(false); // original untouched
  });

  it("removes an id without mutating the original set", () => {
    const original = new Set(["aapl", "btc"]);
    const next = withoutId(original, "btc");
    expect(next.has("btc")).toBe(false);
    expect(original.has("btc")).toBe(true); // original untouched
  });
});

describe("applyFavoriteToggle (add favorite / remove favorite / rollback)", () => {
  it("adds a favorite", () => {
    const next = applyFavoriteToggle(new Set(), "sp500", true);
    expect(next.has("sp500")).toBe(true);
  });

  it("removes a favorite", () => {
    const next = applyFavoriteToggle(new Set(["sp500"]), "sp500", false);
    expect(next.has("sp500")).toBe(false);
  });

  it("optimistic add followed by a rollback (failed persist) restores the prior state", () => {
    const before = new Set<string>();
    const optimistic = applyFavoriteToggle(before, "aapl", true);
    expect(optimistic.has("aapl")).toBe(true);

    // Simulated failed POST -> roll back to "not favorited".
    const rolledBack = applyFavoriteToggle(optimistic, "aapl", false);
    expect(rolledBack.has("aapl")).toBe(false);
    expect(rolledBack).toEqual(before);
  });

  it("optimistic remove followed by a rollback (failed persist) restores the prior state", () => {
    const before = new Set(["aapl"]);
    const optimistic = applyFavoriteToggle(before, "aapl", false);
    expect(optimistic.has("aapl")).toBe(false);

    // Simulated failed DELETE -> roll back to "favorited".
    const rolledBack = applyFavoriteToggle(optimistic, "aapl", true);
    expect(rolledBack.has("aapl")).toBe(true);
    expect(rolledBack).toEqual(before);
  });

  it("toggling one asset never affects another asset's favorite state", () => {
    const before = new Set(["sp500", "btc"]);
    const next = applyFavoriteToggle(before, "sp500", false);
    expect(next.has("sp500")).toBe(false);
    expect(next.has("btc")).toBe(true); // unaffected
  });
});
