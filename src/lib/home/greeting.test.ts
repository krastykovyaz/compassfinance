import { describe, expect, it } from "vitest";
import { getFirstName, getGreetingKey, getGreetingParts, getGreetingPeriod } from "./greeting";

function atHour(hour: number): Date {
  const d = new Date(2026, 0, 1, hour, 0, 0);
  return d;
}

describe("getGreetingPeriod", () => {
  it("is morning for 00:00–11:59", () => {
    expect(getGreetingPeriod(atHour(0))).toBe("morning");
    expect(getGreetingPeriod(atHour(6))).toBe("morning");
    expect(getGreetingPeriod(atHour(11))).toBe("morning");
  });

  it("is afternoon for 12:00–16:59", () => {
    expect(getGreetingPeriod(atHour(12))).toBe("afternoon");
    expect(getGreetingPeriod(atHour(14))).toBe("afternoon");
    expect(getGreetingPeriod(atHour(16))).toBe("afternoon");
  });

  it("is evening for 17:00–23:59", () => {
    expect(getGreetingPeriod(atHour(17))).toBe("evening");
    expect(getGreetingPeriod(atHour(20))).toBe("evening");
    expect(getGreetingPeriod(atHour(23))).toBe("evening");
  });
});

describe("getGreetingKey", () => {
  it("maps each period to its i18n key", () => {
    expect(getGreetingKey("morning")).toBe("home.goodMorning");
    expect(getGreetingKey("afternoon")).toBe("home.goodAfternoon");
    expect(getGreetingKey("evening")).toBe("home.goodEvening");
  });
});

describe("getFirstName", () => {
  it("returns the first token of a full name", () => {
    expect(getFirstName("Alex Johnson")).toBe("Alex");
    expect(getFirstName("Maria")).toBe("Maria");
  });

  it("returns null for missing/empty/whitespace-only names — never a fabricated name", () => {
    expect(getFirstName(null)).toBeNull();
    expect(getFirstName(undefined)).toBeNull();
    expect(getFirstName("")).toBeNull();
    expect(getFirstName("   ")).toBeNull();
  });

  it("collapses extra internal whitespace", () => {
    expect(getFirstName("  Alex   Johnson  ")).toBe("Alex");
  });
});

describe("getGreetingParts", () => {
  it("unauthenticated, morning: generic greeting, no name", () => {
    const { key, name } = getGreetingParts(false, "Alex Johnson", "morning");
    expect(key).toBe("home.goodMorning");
    expect(name).toBeNull();
  });

  it("authenticated with a first name, morning: personalized greeting", () => {
    const { key, name } = getGreetingParts(true, "Alex Johnson", "morning");
    expect(key).toBe("home.goodMorning");
    expect(name).toBe("Alex");
  });

  it("authenticated but no usable name: falls back to the generic greeting", () => {
    const { key, name } = getGreetingParts(true, null, "morning");
    expect(key).toBe("home.goodMorning");
    expect(name).toBeNull();
  });

  it("afternoon variant", () => {
    const { key, name } = getGreetingParts(true, "Maria", "afternoon");
    expect(key).toBe("home.goodAfternoon");
    expect(name).toBe("Maria");
  });

  it("evening variant", () => {
    const { key, name } = getGreetingParts(true, "Maria", "evening");
    expect(key).toBe("home.goodEvening");
    expect(name).toBe("Maria");
  });

  it("never shows a name before authentication, even if a stale/cached name is passed in", () => {
    const { name } = getGreetingParts(false, "Alex Johnson", "evening");
    expect(name).toBeNull();
  });
});
