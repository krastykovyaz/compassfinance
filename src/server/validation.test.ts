import { describe, expect, it } from "vitest";
import {
  isValidLocale,
  isValidRiskProfileId,
  isValidInterestKey,
  isValidNotificationCategory,
  isValidNotificationChannel,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
} from "./validation";

describe("isValidLocale", () => {
  it("accepts the three supported locales", () => {
    expect(isValidLocale("en")).toBe(true);
    expect(isValidLocale("fr")).toBe(true);
    expect(isValidLocale("ru")).toBe(true);
  });
  it("rejects unsupported/arbitrary values", () => {
    expect(isValidLocale("zh")).toBe(false);
    expect(isValidLocale("EN")).toBe(false);
    expect(isValidLocale("")).toBe(false);
    expect(isValidLocale("<script>")).toBe(false);
  });
});

describe("isValidRiskProfileId", () => {
  it("accepts the exact canonical Compass risk-profile ids", () => {
    expect(isValidRiskProfileId("BEGINNER_EXPLORER")).toBe(true);
    expect(isValidRiskProfileId("WEALTH_BUILDER")).toBe(true);
    expect(isValidRiskProfileId("IMPACT_INVESTOR")).toBe(true);
  });
  it("rejects arbitrary client values, even plausible-looking ones", () => {
    expect(isValidRiskProfileId("AGGRESSIVE")).toBe(false);
    expect(isValidRiskProfileId("wealth_builder")).toBe(false);
    expect(isValidRiskProfileId("")).toBe(false);
  });
});

describe("isValidInterestKey", () => {
  it("accepts every defined interest category id", () => {
    expect(isValidInterestKey("TECH_AI")).toBe(true);
    expect(isValidInterestKey("STOCKS")).toBe(true);
  });
  it("rejects unknown keys", () => {
    expect(isValidInterestKey("NOT_A_CATEGORY")).toBe(false);
  });
});

describe("isValidNotificationCategory", () => {
  it("accepts all four canonical categories", () => {
    for (const c of NOTIFICATION_CATEGORIES) {
      expect(isValidNotificationCategory(c)).toBe(true);
    }
  });
  it("rejects anything else", () => {
    expect(isValidNotificationCategory("marketing")).toBe(false);
    expect(isValidNotificationCategory("push")).toBe(false);
  });
});

describe("isValidNotificationChannel", () => {
  it("accepts both canonical channels", () => {
    for (const c of NOTIFICATION_CHANNELS) {
      expect(isValidNotificationChannel(c)).toBe(true);
    }
  });
  it("rejects content categories and anything else", () => {
    expect(isValidNotificationChannel("news")).toBe(false);
    expect(isValidNotificationChannel("sms")).toBe(false);
  });
});
