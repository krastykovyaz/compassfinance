import { describe, expect, it } from "vitest";
import { formatNotification, type NotificationLike } from "./format-notification";

function n(overrides: Partial<NotificationLike>): NotificationLike {
  return {
    type: "learning_completed",
    sourceId: "sp500",
    assetId: "sp500",
    achievementId: null,
    tradeSide: null,
    ...overrides,
  };
}

describe("formatNotification — exact spec strings, real names, no hardcoded progress", () => {
  it("course completed: exact spec title in English", () => {
    const { title } = formatNotification(n({ type: "learning_completed", assetId: "sp500" }), "en");
    expect(title).toBe("Course completed 🎓");
  });

  it("course completed: links to the real lesson page for that asset", () => {
    const { href } = formatNotification(n({ type: "learning_completed", assetId: "sp500" }), "en");
    expect(href).toBe("/learn/indices/sp500");
  });

  it("investment unlocked: exact spec template with the real asset name substituted", () => {
    const { title } = formatNotification(
      n({ type: "investment_unlocked", sourceId: "sp500", assetId: "sp500", achievementId: null }),
      "en"
    );
    expect(title).toBe("S&P 500 is now available for paper trading 🚀");
  });

  it("investment unlocked: links to the asset page, never a hardcoded route", () => {
    const { href } = formatNotification(n({ type: "investment_unlocked", assetId: "nasdaq" }), "en");
    expect(href).toBe("/asset/nasdaq");
  });

  it("paper trade executed: exact spec title, generic regardless of side", () => {
    const { title } = formatNotification(
      n({ type: "paper_trade_completed", assetId: "aapl", tradeSide: "BUY" }),
      "en"
    );
    expect(title).toBe("Paper trade executed");
  });

  it("paper trade executed: links to the real position page for the traded asset", () => {
    const { href } = formatNotification(
      n({ type: "paper_trade_completed", assetId: "aapl", tradeSide: "SELL" }),
      "en"
    );
    expect(href).toBe("/position/aapl");
  });

  it("achievement earned: exact spec title for a normal achievement", () => {
    const { title } = formatNotification(
      n({ type: "achievement_earned", sourceId: "FIRST_LESSON", assetId: null, achievementId: "FIRST_LESSON" }),
      "en"
    );
    expect(title).toBe("Achievement unlocked 🏆");
  });

  it("achievement earned: SEVEN_DAY_STREAK gets the streak-specific title instead", () => {
    const { title } = formatNotification(
      n({
        type: "achievement_earned",
        sourceId: "SEVEN_DAY_STREAK",
        assetId: null,
        achievementId: "SEVEN_DAY_STREAK",
      }),
      "en"
    );
    expect(title).toBe("7-day learning streak 🔥");
  });

  it("achievement earned: links to the real achievements section, no invented page", () => {
    const { href } = formatNotification(
      n({ type: "achievement_earned", assetId: null, achievementId: "FIRST_QUIZ" }),
      "en"
    );
    expect(href).toBe("/learn");
  });

  it("uses the real localized asset/achievement name, never the raw id, and differs by locale", () => {
    const en = formatNotification(n({ type: "investment_unlocked", assetId: "aapl" }), "en");
    const ru = formatNotification(n({ type: "investment_unlocked", assetId: "aapl" }), "ru");
    expect(en.title).not.toContain("aapl");
    expect(ru.title).not.toContain("aapl");
    expect(ru.title).not.toBe(en.title); // real translation, not an English fallback string
  });

  it("falls back to the catalog's English name for an asset with no localized-unlock entry", () => {
    const { body } = formatNotification(n({ type: "paper_trade_completed", assetId: "gold" }), "ru");
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toBe("gold"); // resolved to a real display name, not the raw id
  });
});
