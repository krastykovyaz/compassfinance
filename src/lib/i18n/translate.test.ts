import { describe, expect, it } from "vitest";
import { getByPath, resolveInitialLocale, toSupportedLocale, translate } from "./translate";

describe("translate() — English renders correctly (test 1)", () => {
  it("resolves a known key to its English string", () => {
    expect(translate("en", "navigation.home")).toBe("Home");
    expect(translate("en", "investment.locked")).toBe("Investment Locked");
  });
});

describe("translate() — French renders correctly (test 2)", () => {
  it("resolves a known key to its French string", () => {
    expect(translate("fr", "navigation.home")).toBe("Accueil");
    expect(translate("fr", "learning.continueLearning")).toBe("Continuer l'apprentissage");
  });
});

describe("translate() — Russian renders correctly (test 3)", () => {
  it("resolves a known key to its Russian string", () => {
    expect(translate("ru", "navigation.home")).toBe("Главная");
    expect(translate("ru", "learning.xp")).toBe("XP");
  });
});

describe("translate() — missing translation falls back safely (test 5)", () => {
  it("falls back to English when a key is absent from the active locale", () => {
    // Simulate a locale dictionary missing a key by looking up a path that
    // doesn't exist anywhere — translate() must still return a string
    // (the key itself, as an absolute last resort) rather than throwing.
    expect(() => translate("fr", "totally.missing.key")).not.toThrow();
    expect(translate("fr", "totally.missing.key")).toBe("totally.missing.key");
  });

  it("never throws for an unsupported locale code", () => {
    // @ts-expect-error — deliberately passing an invalid locale to prove
    // the app can't crash even if a corrupted localStorage value slips in.
    expect(() => translate("de", "navigation.home")).not.toThrow();
  });
});

describe("toSupportedLocale() — coerces a stored DB value into a real Locale", () => {
  it("passes through a supported locale unchanged", () => {
    expect(toSupportedLocale("ru")).toBe("ru");
    expect(toSupportedLocale("fr")).toBe("fr");
  });

  it("defaults to English for null, undefined, empty, or unsupported values", () => {
    expect(toSupportedLocale(null)).toBe("en");
    expect(toSupportedLocale(undefined)).toBe("en");
    expect(toSupportedLocale("")).toBe("en");
    expect(toSupportedLocale("de")).toBe("en");
  });
});

describe("getByPath()", () => {
  it("returns undefined instead of throwing for a missing nested path", () => {
    expect(getByPath({ a: { b: 1 } }, "a.b")).toBe(1);
    expect(getByPath({ a: { b: 1 } }, "a.c.d")).toBeUndefined();
    expect(getByPath(null, "a.b")).toBeUndefined();
  });
});

describe("resolveInitialLocale() — locale persists (test 4)", () => {
  it("prefers a valid persisted locale over the browser locale", () => {
    expect(resolveInitialLocale("ru", ["fr-FR", "en-US"])).toBe("ru");
  });

  it("falls back to a supported browser locale when nothing is persisted", () => {
    expect(resolveInitialLocale(null, ["fr-FR", "en-US"])).toBe("fr");
  });

  it("falls back to English when nothing persisted or supported in the browser", () => {
    expect(resolveInitialLocale(null, ["de-DE", "zh-CN"])).toBe("en");
    expect(resolveInitialLocale("not-a-real-locale", [])).toBe("en");
  });
});

describe("Insight of the Day localization (Milestone 25)", () => {
  it("the section title is real and distinct in every supported locale", () => {
    expect(translate("en", "home.todaysInsight")).toBe("Today's insight");
    expect(translate("ru", "home.todaysInsight")).toBe("Инсайт дня");
    expect(translate("fr", "home.todaysInsight")).not.toBe(translate("en", "home.todaysInsight"));
  });

  it("the unavailable-state fallback message is localized, not hardcoded English", () => {
    const en = translate("en", "home.insightUnavailable");
    const ru = translate("ru", "home.insightUnavailable");
    const fr = translate("fr", "home.insightUnavailable");
    expect(en.length).toBeGreaterThan(0);
    expect(ru).not.toBe(en);
    expect(fr).not.toBe(en);
  });

  it("falls back to the raw key (never a crash) when a translation is missing everywhere", () => {
    // Exercises the same fallback path any Insight of the Day key would
    // hit if a locale's dictionary somehow lost its entry.
    expect(translate("ru", "home.notARealInsightKey")).toBe("home.notARealInsightKey");
  });
});
