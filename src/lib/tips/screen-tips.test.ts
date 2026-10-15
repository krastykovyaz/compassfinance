import { describe, expect, it } from "vitest";
import { SCREEN_TIPS, getTipForPath, readTipPreferences, shouldShowTip, writeTipPreferences } from "./screen-tips";
import en from "@/lib/i18n/translations/en";
import fr from "@/lib/i18n/translations/fr";
import ru from "@/lib/i18n/translations/ru";
import { getByPath } from "@/lib/i18n/translate";

function memoryStorage(initial?: string) {
  let value: string | null = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, v: string) => {
      value = v;
    },
    get value() {
      return value;
    },
  };
}

describe("SCREEN_TIPS", () => {
  it("has unique ids and one tip per screen", () => {
    expect(new Set(SCREEN_TIPS.map((t) => t.id)).size).toBe(SCREEN_TIPS.length);
    expect(new Set(SCREEN_TIPS.map((t) => t.path)).size).toBe(SCREEN_TIPS.length);
  });

  it("every title and body exists, non-empty, in all three languages (no silent English fallback)", () => {
    for (const tip of SCREEN_TIPS) {
      for (const dict of [en, fr, ru]) {
        for (const key of [tip.titleKey, tip.bodyKey]) {
          const value = getByPath(dict, key);
          expect(typeof value, key).toBe("string");
          expect((value as string).length, key).toBeGreaterThan(0);
        }
      }
    }
  });

  it("the shared labels exist in all three languages", () => {
    for (const dict of [en, fr, ru]) {
      for (const key of ["tips.close", "tips.gotIt", "tips.hideAll"]) expect(typeof getByPath(dict, key)).toBe("string");
    }
  });
});

describe("getTipForPath", () => {
  it("matches a screen exactly, tolerates a trailing slash, and finds nothing for detail pages", () => {
    expect(getTipForPath("/")?.id).toBe("home-v1");
    expect(getTipForPath("/portfolio/")?.id).toBe("portfolio-v1");
    expect(getTipForPath("/profile/connected-accounts")?.id).toBe("connected-accounts-v1");
    expect(getTipForPath("/news/some-article")).toBeNull();
    expect(getTipForPath("/asset/nvda")).toBeNull();
  });
});

describe("tip preferences", () => {
  it("round-trips, and shows a tip only until it is dismissed or tips are turned off", () => {
    const storage = memoryStorage();
    const tip = getTipForPath("/markets");
    expect(shouldShowTip(tip, readTipPreferences(storage))).toBe(true);
    writeTipPreferences(storage, { dismissed: ["markets-v1"], off: false });
    const prefs = readTipPreferences(storage);
    expect(shouldShowTip(tip, prefs)).toBe(false);
    expect(shouldShowTip(getTipForPath("/news"), prefs)).toBe(true);
    expect(shouldShowTip(getTipForPath("/news"), { dismissed: [], off: true })).toBe(false);
    expect(shouldShowTip(null, prefs)).toBe(false);
  });

  it("survives corrupt, wrongly shaped or unavailable storage", () => {
    expect(readTipPreferences(memoryStorage("not json"))).toEqual({ dismissed: [], off: false });
    expect(readTipPreferences(memoryStorage('{"dismissed":[1,"a"],"off":"yes"}'))).toEqual({ dismissed: ["a"], off: false });
    expect(readTipPreferences(null)).toEqual({ dismissed: [], off: false });
    expect(() => writeTipPreferences({ setItem: () => { throw new Error("full"); } }, { dismissed: [], off: false })).not.toThrow();
    expect(() => writeTipPreferences(null, { dismissed: [], off: false })).not.toThrow();
  });
});
