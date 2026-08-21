import { describe, expect, it } from "vitest";
import {
  INTEREST_CATEGORIES,
  scoreExploreThemeForInterests,
  sortNewsByInterest,
  sortThemesByInterest,
} from "./interests";
import { NewsItem } from "@/lib/news/news-types";

function item(overrides: Partial<NewsItem>): NewsItem {
  return {
    id: overrides.id ?? "1",
    title: "",
    description: "",
    source: "Test Source",
    url: "https://example.com",
    imageUrl: null,
    publishedAt: new Date().toISOString(),
    symbols: [],
    entities: [],
    category: "general",
    ...overrides,
  };
}

describe("INTEREST_CATEGORIES", () => {
  it("covers all seven categories from the brief and stays extensible (test not tied to a fixed count elsewhere)", () => {
    const ids = INTEREST_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual([
      "TECH_AI",
      "STOCKS",
      "CRYPTO",
      "COMMODITIES",
      "ENERGY",
      "MARKET_INDICES",
      "IMPACT_ESG",
    ]);
  });
});

describe("sortNewsByInterest() — news prioritization responds to selected interests (test 14)", () => {
  it("prioritizes crypto news when CRYPTO is selected, without removing other items", () => {
    const cryptoItem = item({ id: "crypto-1", symbols: ["BTC"], category: "crypto" });
    const stockItem = item({ id: "stock-1", symbols: ["MSFT"], category: "stocks" });
    const items = [stockItem, cryptoItem];

    const sorted = sortNewsByInterest(items, ["CRYPTO"]);

    expect(sorted[0].id).toBe("crypto-1");
    // Nothing is dropped — personalization, not hiding the market.
    expect(sorted).toHaveLength(2);
    expect(sorted.map((i) => i.id).sort()).toEqual(["crypto-1", "stock-1"]);
  });

  it("prioritizes tech-relevant tickers when Technology & AI is selected", () => {
    const nvidiaItem = item({ id: "nvda-1", symbols: ["NVDA"], category: "stocks" });
    const genericItem = item({ id: "gen-1", symbols: [], category: "general" });

    const sorted = sortNewsByInterest([genericItem, nvidiaItem], ["TECH_AI"]);
    expect(sorted[0].id).toBe("nvda-1");
  });

  it("is a no-op (preserves original order) when no interests are selected", () => {
    const a = item({ id: "a" });
    const b = item({ id: "b" });
    expect(sortNewsByInterest([a, b], [])).toEqual([a, b]);
  });
});

describe("sortThemesByInterest() / scoreExploreThemeForInterests() — Explore prioritization responds to selected interests (test 15)", () => {
  it("surfaces the tech theme first when TECH_AI is selected", () => {
    const themes = [{ id: "healthcare" }, { id: "tech" }, { id: "consumer" }];
    const sorted = sortThemesByInterest(themes, ["TECH_AI"]);
    expect(sorted[0].id).toBe("tech");
  });

  it("scores 0 for a theme with no matching interest", () => {
    expect(scoreExploreThemeForInterests("consumer", ["ENERGY"])).toBe(0);
  });
});
