import { describe, expect, it } from "vitest";
import {
  INITIAL_NAVIGATION_HISTORY_STATE,
  observePathname,
  shouldUseRealHistory,
} from "./navigation-history";

describe("observePathname / shouldUseRealHistory", () => {
  it("has no internal history on the very first pathname observed (direct load)", () => {
    const s1 = observePathname(INITIAL_NAVIGATION_HISTORY_STATE, "/asset/nvda");
    expect(shouldUseRealHistory(s1)).toBe(false);
  });

  it("gains internal history after a second, different pathname (test 26 — safe fallback for direct loads)", () => {
    const s1 = observePathname(INITIAL_NAVIGATION_HISTORY_STATE, "/news");
    const s2 = observePathname(s1, "/news/123");
    expect(shouldUseRealHistory(s2)).toBe(true);
  });

  it("News -> News Detail -> Asset -> Back retraces through News Detail (test 22, 17)", () => {
    let s = INITIAL_NAVIGATION_HISTORY_STATE;
    s = observePathname(s, "/news");
    s = observePathname(s, "/news/abc");
    s = observePathname(s, "/asset/nvda");
    expect(shouldUseRealHistory(s)).toBe(true);
  });

  it("Explore -> Asset -> Back returns to Explore (test 23)", () => {
    let s = INITIAL_NAVIGATION_HISTORY_STATE;
    s = observePathname(s, "/explore");
    s = observePathname(s, "/asset/nvda");
    expect(shouldUseRealHistory(s)).toBe(true);
  });

  it("does not flag history for a re-render with the same pathname", () => {
    const s1 = observePathname(INITIAL_NAVIGATION_HISTORY_STATE, "/news");
    const s2 = observePathname(s1, "/news");
    expect(shouldUseRealHistory(s2)).toBe(false);
  });

  it("directly-opened nested routes have no internal history to retrace (test 26)", () => {
    const s = observePathname(INITIAL_NAVIGATION_HISTORY_STATE, "/profile/risk-profile");
    expect(shouldUseRealHistory(s)).toBe(false);
  });
});
