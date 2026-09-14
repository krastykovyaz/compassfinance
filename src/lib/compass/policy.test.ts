import { describe, expect, it } from "vitest";
import { classifyMessageIntent, containsRecommendationLanguage, buildSafeRedirect } from "./policy";

// Every example is taken verbatim from the Phase 4 spec's own Section
// 6/42 prohibited and allowed lists — this test IS the acceptance
// criteria, not just a sanity check.

const PROHIBITED_MESSAGES = [
  "Should I buy NVIDIA?",
  "Should I sell NVIDIA?",
  "Should I sell Bitcoin?",
  "What should I invest in?",
  "Which asset should I buy?",
  "Which crypto should I invest in?",
  "Should I increase Apple?",
  "Should I reduce Bitcoin?",
  "What should I rebalance?",
];

const ALLOWED_MESSAGES = [
  "What does buying a stock mean?",
  "What is a sell order?",
  "Explain what holding an asset means.",
  "Why can a stock fall 20%?",
  "Show a hypothetical scenario where NVIDIA falls 20%.",
  "Explain what a sell order is.",
  "Compare Apple and Microsoft.",
  "What happens if Bitcoin falls 20%?",
  "What are the risks in my portfolio?",
  "Why did NVIDIA move?",
];

describe("classifyMessageIntent", () => {
  it.each(PROHIBITED_MESSAGES)("classifies %j as advice_seeking", (message) => {
    expect(classifyMessageIntent(message)).toBe("advice_seeking");
  });

  it.each(ALLOWED_MESSAGES)("classifies %j as neutral (never blocked)", (message) => {
    expect(classifyMessageIntent(message)).toBe("neutral");
  });

  it("is not a naive keyword blocker — 'buy'/'sell'/'invest' alone never trip it", () => {
    expect(classifyMessageIntent("What does buying a stock mean?")).toBe("neutral");
    expect(classifyMessageIntent("Explain what a sell order is.")).toBe("neutral");
    expect(classifyMessageIntent("How does investing in an index fund work?")).toBe("neutral");
  });

  it("recognizes imperative decision-delegation without the word 'should'", () => {
    expect(classifyMessageIntent("Tell me what to buy.")).toBe("advice_seeking");
    expect(classifyMessageIntent("Pick a stock for me.")).toBe("advice_seeking");
    expect(classifyMessageIntent("Recommend an asset to me.")).toBe("advice_seeking");
  });

  it("is case-insensitive", () => {
    expect(classifyMessageIntent("SHOULD I BUY NVIDIA?")).toBe("advice_seeking");
  });
});

describe("containsRecommendationLanguage — the output-side safety net", () => {
  const FORBIDDEN_RESPONSES = [
    "Buy NVIDIA.",
    "Sell Tesla.",
    "Hold Apple.",
    "You should buy Bitcoin.",
    "You should sell this position.",
    "Increase your NVIDIA allocation. You should increase this position.",
    "I recommend NVIDIA.",
    "You should rebalance.",
    "Open a position. You should open this position.",
    "You should close the position.",
    "Enter this trade. You should enter this trade.",
    "Exit this trade. You should exit this trade.",
  ];

  it.each(FORBIDDEN_RESPONSES)("flags %j as recommendation language", (text) => {
    expect(containsRecommendationLanguage(text)).toBe(true);
  });

  const SAFE_RESPONSES = [
    "NVIDIA is up 2.3% today, contributing about half of your portfolio's gain.",
    "Technology-related assets represent 62% of your portfolio. That means your portfolio is relatively exposed to movements in the technology sector.",
    "I can't recommend what you should buy. I can compare the assets, explain their risks, performance, relevant news and how they relate to your existing portfolio.",
    "I can't decide whether you should sell NVIDIA. I can analyze the position, its contribution to your portfolio, recent performance, relevant news and associated risks.",
  ];

  it.each(SAFE_RESPONSES)("never flags a genuinely safe analytical response: %j", (text) => {
    expect(containsRecommendationLanguage(text)).toBe(false);
  });
});

describe("buildSafeRedirect", () => {
  it("matches the spec's own worked example for 'What should I buy?'", () => {
    const redirect = buildSafeRedirect(null);
    expect(redirect).toMatch(/can't recommend/i);
    expect(redirect).toMatch(/compare/i);
  });

  it("names the topic when one is identifiable, matching the 'Should I sell NVIDIA?' worked example", () => {
    const redirect = buildSafeRedirect("NVIDIA");
    expect(redirect).toContain("NVIDIA");
    expect(redirect).toMatch(/can't tell you whether/i);
  });

  it("never itself contains recommendation language", () => {
    expect(containsRecommendationLanguage(buildSafeRedirect(null))).toBe(false);
    expect(containsRecommendationLanguage(buildSafeRedirect("NVIDIA"))).toBe(false);
  });
});
