import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsItem } from "@/lib/news/news-types";

// Same reason as news-cache.test.ts: the cache lives on globalThis so it
// survives Next.js dev-mode hot reloads, which means it also survives
// vi.resetModules() between tests unless cleared explicitly here.
function resetGlobalCache() {
  const g = globalThis as unknown as {
    __compassNewsCache?: unknown;
    __compassNewsInFlight?: unknown;
  };
  delete g.__compassNewsCache;
  delete g.__compassNewsInFlight;
}

function item(id: string): NewsItem {
  return {
    id,
    title: `Headline ${id}`,
    description: "",
    source: "Reuters",
    url: "https://example.com",
    imageUrl: null,
    publishedAt: "2024-01-01T00:00:00.000Z",
    symbols: [],
    entities: [],
    category: "general",
  };
}

const getLatestNews = vi.fn();

vi.mock("@/lib/news/news-provider", () => ({
  getNewsProvider: () => ({ id: "marketaux", getLatestNews }),
}));

function request(locale?: string) {
  const url = locale ? `http://localhost/api/news?locale=${locale}` : "http://localhost/api/news";
  return new Request(url);
}

async function freshRoute() {
  resetGlobalCache();
  vi.resetModules();
  return import("./route");
}

describe("GET /api/news — production real-news behavior (NEWS_PROVIDER=marketaux)", () => {
  beforeEach(() => {
    getLatestNews.mockReset();
  });

  it("returns real Marketaux articles on a successful request", async () => {
    getLatestNews.mockResolvedValue([item("1")]);
    const { GET } = await freshRoute();

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("marketaux");
    expect(body.items).toEqual([item("1")]);
    expect(body.degraded).toBeFalsy();
  });

  it("serves the fresh cache on a second request without a second provider call", async () => {
    getLatestNews.mockResolvedValue([item("1")]);
    const { GET } = await freshRoute();

    await GET(request());
    const second = await GET(request());
    const body = await second.json();

    expect(getLatestNews).toHaveBeenCalledTimes(1);
    expect(body.cached).toBe(true);
    expect(body.source).toBe("marketaux");
    expect(body.items).toEqual([item("1")]);
  });

  it("serves the stale real cache (flagged as degraded) when a refresh attempt fails", async () => {
    vi.useFakeTimers();
    try {
      getLatestNews.mockResolvedValueOnce([item("1")]).mockRejectedValueOnce(new Error("down"));
      const { GET } = await freshRoute();
      const { NEWS_CACHE_TTL_MS } = await import("@/lib/news/news-cache");

      await GET(request());
      vi.advanceTimersByTime(NEWS_CACHE_TTL_MS + 1);
      const second = await GET(request());
      const body = await second.json();

      expect(second.status).toBe(200);
      expect(body.source).toBe("marketaux");
      expect(body.items).toEqual([item("1")]); // stale REAL data, not fabricated
      expect(body.degraded).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a localized unavailable state (503, no items) when the provider fails with no cache — never mock", async () => {
    getLatestNews.mockRejectedValue(new Error("down"));
    const { GET } = await freshRoute();

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.items).toEqual([]);
    expect(body.source).toBe("marketaux"); // never silently "mock"
    expect(body.degraded).toBe(true);
    expect(typeof body.error).toBe("string");
  });

  it("never injects mock news when provider=marketaux, even after repeated failures", async () => {
    getLatestNews.mockRejectedValue(new Error("down"));
    const { GET } = await freshRoute();

    for (let i = 0; i < 3; i++) {
      const res = await GET(request());
      const body = await res.json();
      expect(body.source).not.toBe("mock");
      expect(body.items).toEqual([]);
    }
  });
});
