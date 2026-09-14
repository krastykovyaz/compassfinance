import { describe, expect, it } from "vitest";
import { getSuggestedQuestionKeys } from "./suggested-questions";
import { classifyMessageIntent } from "./policy";
import en from "@/lib/i18n/translations/en";
import { getByPath } from "@/lib/i18n/translate";
import type { CompassContextType } from "./context";

const ALL_CONTEXT_TYPES: CompassContextType[] = [
  "HOME",
  "PORTFOLIO",
  "ASSET",
  "NEWS",
  "LEARNING",
  "TRADING212_CONNECTION",
  "IBKR_CONNECTION",
  "HYPERLIQUID_CONNECTION",
  "PROFILE",
];

describe("getSuggestedQuestionKeys", () => {
  it("returns 3-4 non-empty keys for every context type", () => {
    for (const type of ALL_CONTEXT_TYPES) {
      const keys = getSuggestedQuestionKeys(type);
      expect(keys.length).toBeGreaterThanOrEqual(3);
      expect(keys.length).toBeLessThanOrEqual(4);
      expect(new Set(keys).size).toBe(keys.length); // no duplicates
    }
  });

  it("every returned key resolves to real English text (no missing translation)", () => {
    for (const type of ALL_CONTEXT_TYPES) {
      for (const key of getSuggestedQuestionKeys(type)) {
        const value = getByPath(en, key);
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("Section 27: every suggested question's real text is safe under the no-recommendation policy classifier — none can ever trigger the advice-seeking short-circuit when one-tap sent", () => {
    for (const type of ALL_CONTEXT_TYPES) {
      for (const key of getSuggestedQuestionKeys(type)) {
        const text = getByPath(en, key) as string;
        expect(classifyMessageIntent(text)).toBe("neutral");
      }
    }
  });

  it("returns a different, screen-specific list per context type — never the same generic list everywhere", () => {
    const home = getSuggestedQuestionKeys("HOME");
    const asset = getSuggestedQuestionKeys("ASSET");
    const news = getSuggestedQuestionKeys("NEWS");
    expect(home).not.toEqual(asset);
    expect(asset).not.toEqual(news);
  });
});
