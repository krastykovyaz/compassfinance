import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
vi.mock("@/lib/ai/providers/deepseek-provider", () => ({
  DeepSeekProvider: class {
    id = "deepseek";
    complete = (...args: unknown[]) => completeMock(...args);
  },
}));

vi.mock("./news-translation-cache", () => ({
  buildNewsTranslationCacheKey: () => "cache-key",
  getCachedNewsTranslation: () => null,
  getNewsTranslationInFlight: () => null,
  setCachedNewsTranslation: () => {},
  setNewsTranslationInFlight: () => {},
  clearNewsTranslationInFlight: () => {},
}));

import { getLocalizedNews } from "./news-translator";
import type { NewsItem } from "./news-types";

const ITEMS: NewsItem[] = [
  { id: "n1", title: "Title", description: "Description", source: "Reuters", url: "https://x", imageUrl: null, publishedAt: "2026-01-01T00:00:00.000Z", symbols: [], entities: [], category: "general" },
];

beforeEach(() => {
  vi.clearAllMocks();
  completeMock.mockResolvedValue({ ok: true, text: JSON.stringify({ items: [{ id: "n1", title: "Titre", description: "Description FR" }] }), latencyMs: 50 });
});

describe("getLocalizedNews — expectJson (shares DeepSeek's reasoning-eats-budget risk with Compass)", () => {
  it("sets expectJson: true on the translation call, which defaults DeepSeekProvider to disableReasoning", async () => {
    await getLocalizedNews(ITEMS, "fr");
    expect(completeMock).toHaveBeenCalledWith(expect.objectContaining({ expectJson: true }));
  });
});
