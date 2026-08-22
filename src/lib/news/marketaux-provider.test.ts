import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketauxProvider } from "./marketaux-provider";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: "",
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

function rawArticle(uuid: string, publishedAt: string) {
  return {
    uuid,
    title: `Headline ${uuid}`,
    description: "desc",
    url: `https://example.com/${uuid}`,
    image_url: null,
    source: "Reuters",
    published_at: publishedAt,
    entities: [],
  };
}

function pageParam(url: string): number {
  return Number(new URL(url).searchParams.get("page"));
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, MARKETAUX_API_TOKEN: "test-token" };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("marketauxProvider.getLatestNews — multi-page batching", () => {
  it("throws when no token is configured", async () => {
    delete process.env.MARKETAUX_API_TOKEN;
    await expect(marketauxProvider.getLatestNews()).rejects.toThrow(/token/i);
  });

  it("combines 4 pages of 3 articles each into one 12-article batch", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const page = pageParam(url);
      return jsonResponse({
        meta: { found: 100, returned: 3, limit: 3, page },
        data: [1, 2, 3].map((n) => rawArticle(`p${page}-${n}`, `2026-08-2${page}T0${n}:00:00.000000Z`)),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await marketauxProvider.getLatestNews();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(items).toHaveLength(12);
  });

  it("requests published_after (last 7 days) and sort=published_desc on every page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await marketauxProvider.getLatestNews();

    for (const call of fetchMock.mock.calls) {
      const url = new URL(call[0] as string);
      expect(url.searchParams.get("sort")).toBe("published_desc");
      const publishedAfter = url.searchParams.get("published_after");
      expect(publishedAfter).not.toBeNull();
      const daysAgo = (Date.now() - Date.parse(`${publishedAfter}Z`)) / (24 * 60 * 60 * 1000);
      expect(daysAgo).toBeGreaterThan(6.9);
      expect(daysAgo).toBeLessThan(7.1);
    }
  });

  it("returns results sorted strictly newest-first, even if upstream pages arrive out of order", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const page = pageParam(url);
      // Page 1 (normally "newest") deliberately returns an OLDER article
      // than page 2 — the provider must still sort the combined batch,
      // never trust upstream ordering blindly across pages.
      const publishedAt = page === 1 ? "2026-08-10T00:00:00.000000Z" : "2026-08-20T00:00:00.000000Z";
      return jsonResponse({ data: [rawArticle(`a${page}`, publishedAt)] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await marketauxProvider.getLatestNews();

    for (let i = 1; i < items.length; i++) {
      expect(Date.parse(items[i - 1].publishedAt)).toBeGreaterThanOrEqual(Date.parse(items[i].publishedAt));
    }
  });

  it("de-duplicates an article that appears on more than one page", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const page = pageParam(url);
      // Same uuid "dup" shows up on both page 1 and page 2.
      return jsonResponse({ data: [rawArticle("dup", "2026-08-2" + page + "T00:00:00.000000Z")] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await marketauxProvider.getLatestNews();

    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
    expect(ids.filter((id) => id === "dup")).toHaveLength(1);
  });

  it("throws when page 1 itself fails — the feed is genuinely down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })));
    await expect(marketauxProvider.getLatestNews()).rejects.toThrow();
  });

  it("degrades gracefully when a LATER page fails — keeps the pages that already succeeded", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const page = pageParam(url);
      if (page >= 3) return jsonResponse({}, { ok: false, status: 500 });
      return jsonResponse({ data: [rawArticle(`ok${page}`, "2026-08-20T00:00:00.000000Z")] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await marketauxProvider.getLatestNews();

    // Pages 1-2 succeeded (1 article each) before page 3 failed and
    // stopped the loop — real articles are kept, nothing is fabricated.
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(["ok1", "ok2"]);
  });

  it("degrades gracefully when a later page's upstream API error fires", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const page = pageParam(url);
      if (page >= 2) return jsonResponse({ error: { code: "rate_limited", message: "too many requests" } });
      return jsonResponse({ data: [rawArticle("only-one", "2026-08-20T00:00:00.000000Z")] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await marketauxProvider.getLatestNews();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("only-one");
  });
});
