import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function freshGetNewsProvider() {
  vi.resetModules();
  const mod = await import("./news-provider");
  return mod.getNewsProvider;
}

describe("getNewsProvider — real-vs-mock selection (Milestone 25 QA)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to mock when NEWS_PROVIDER is unset", async () => {
    delete process.env.NEWS_PROVIDER;
    const getNewsProvider = await freshGetNewsProvider();
    expect(getNewsProvider().id).toBe("mock");
  });

  it("uses mock only when explicitly requested", async () => {
    process.env.NEWS_PROVIDER = "mock";
    const getNewsProvider = await freshGetNewsProvider();
    expect(getNewsProvider().id).toBe("mock");
  });

  it("uses the real marketaux provider when configured with a token", async () => {
    process.env.NEWS_PROVIDER = "marketaux";
    process.env.MARKETAUX_API_TOKEN = "test-token";
    const getNewsProvider = await freshGetNewsProvider();
    expect(getNewsProvider().id).toBe("marketaux");
  });

  it("still returns the real marketaux provider even with no token configured — never silently mock", async () => {
    // This is the exact bug fixed this milestone: a production deployment
    // with NEWS_PROVIDER=marketaux but a missing token must surface as a
    // real provider failure (fresh cache -> stale cache -> unavailable),
    // never as fabricated articles that look real.
    process.env.NEWS_PROVIDER = "marketaux";
    delete process.env.MARKETAUX_API_TOKEN;
    const getNewsProvider = await freshGetNewsProvider();
    expect(getNewsProvider().id).toBe("marketaux");
  });

  it("is case-insensitive for the NEWS_PROVIDER value", async () => {
    process.env.NEWS_PROVIDER = "MarketAux";
    process.env.MARKETAUX_API_TOKEN = "test-token";
    const getNewsProvider = await freshGetNewsProvider();
    expect(getNewsProvider().id).toBe("marketaux");
  });
});
