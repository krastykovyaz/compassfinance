import { describe, expect, it } from "vitest";
import { countDistinctSources } from "./count-distinct-sources";
import type { NewsItem } from "./news-types";

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: "1",
    title: "Headline",
    description: "",
    source: "Reuters",
    url: "https://example.com",
    imageUrl: null,
    publishedAt: new Date().toISOString(),
    symbols: [],
    entities: [],
    category: "stocks",
    ...overrides,
  };
}

describe("countDistinctSources — the real Trusted Sources count, no hardcoded number", () => {
  it("is 0 for an empty news list — never a fake default like 12", () => {
    expect(countDistinctSources([])).toBe(0);
  });

  it("counts each distinct real publisher exactly once", () => {
    const items = [
      item({ id: "1", source: "Reuters" }),
      item({ id: "2", source: "Bloomberg" }),
      item({ id: "3", source: "Reuters" }), // same publisher again
      item({ id: "4", source: "Market Watch" }),
    ];
    expect(countDistinctSources(items)).toBe(3);
  });

  it("automatically changes when the underlying news set changes — proving it's derived, not a fixed config", () => {
    const before = [item({ id: "1", source: "Reuters" })];
    const after = [
      item({ id: "1", source: "Reuters" }),
      item({ id: "2", source: "Bloomberg" }),
    ];
    expect(countDistinctSources(before)).toBe(1);
    expect(countDistinctSources(after)).toBe(2);
  });
});
