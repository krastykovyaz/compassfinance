import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAccountView = vi.fn();
vi.mock("@/server/services/trading-service", () => ({ getAccountView: (...args: unknown[]) => getAccountView(...args) }));

const getTrading212Portfolio = vi.fn();
vi.mock("@/server/repositories/trading212-portfolio-repository", () => ({
  getTrading212Portfolio: (...args: unknown[]) => getTrading212Portfolio(...args),
}));

const getTrading212Connection = vi.fn();
vi.mock("@/server/repositories/trading212-repository", () => ({
  getTrading212Connection: (...args: unknown[]) => getTrading212Connection(...args),
}));

const getInteractiveBrokersPortfolio = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-portfolio-repository", () => ({
  getInteractiveBrokersPortfolio: (...args: unknown[]) => getInteractiveBrokersPortfolio(...args),
}));

const getInteractiveBrokersConnection = vi.fn();
vi.mock("@/server/repositories/interactive-brokers-repository", () => ({
  getInteractiveBrokersConnection: (...args: unknown[]) => getInteractiveBrokersConnection(...args),
}));

const getPrimaryWallet = vi.fn();
vi.mock("@/server/repositories/wallet-repository", () => ({ getPrimaryWallet: (...args: unknown[]) => getPrimaryWallet(...args) }));

const getHyperliquidAccount = vi.fn();
vi.mock("@/server/hyperliquid/service", () => ({ getHyperliquidAccount: (...args: unknown[]) => getHyperliquidAccount(...args) }));

const getQuotes = vi.fn();
vi.mock("@/server/market/service", () => ({ getQuotes: (...args: unknown[]) => getQuotes(...args) }));

const getLatestNews = vi.fn();
vi.mock("@/lib/news/news-provider", () => ({ getNewsProvider: () => ({ getLatestNews }) }));

const buildLearningContext = vi.fn();
vi.mock("@/lib/ai/curriculum-context", () => ({ buildLearningContext: (...args: unknown[]) => buildLearningContext(...args) }));

import { buildFinancialContext, detectMentionedAssetId } from "./financial-context-builder";

const EMPTY_PAPER = { cashBalance: 0, portfolioValue: 0, investedValue: 0, unrealizedPnl: 0, realizedPnl: 0, positions: [], trades: [], pricesUnavailableFor: [] };

function stubEverythingEmpty() {
  getAccountView.mockResolvedValue(EMPTY_PAPER);
  getTrading212Connection.mockResolvedValue(null);
  getTrading212Portfolio.mockResolvedValue(null);
  getInteractiveBrokersConnection.mockResolvedValue(null);
  getInteractiveBrokersPortfolio.mockResolvedValue(null);
  getPrimaryWallet.mockResolvedValue(null);
  getHyperliquidAccount.mockResolvedValue({ status: "unavailable", reason: "address is required" });
  getQuotes.mockResolvedValue([]);
  getLatestNews.mockResolvedValue([]);
  buildLearningContext.mockReturnValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubEverythingEmpty();
});

describe("buildFinancialContext — PORTFOLIO context, single source", () => {
  it("PAPER: fetches only the paper account, no other provider calls", async () => {
    getAccountView.mockResolvedValue({
      ...EMPTY_PAPER,
      portfolioValue: 1000,
      positions: [{ assetId: "nvda", symbol: "NVDA", name: "NVIDIA Corp.", quantity: 5, averageEntryPrice: 100, currentPrice: 120, marketValue: 600, unrealizedPnl: 100, unrealizedPnlPercent: 20 }],
    });
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "PAPER" }, message: "How is my portfolio?", locale: "en" });
    expect(result.portfolios).toHaveLength(1);
    expect(result.portfolios[0].source).toBe("PAPER");
    expect(result.portfolios[0].totalValue).toBe(1000);
    expect(result.portfolios[0].coverage).toEqual({ provider: "paper", status: "AVAILABLE", lastSyncedAt: null, message: null });
    expect(getTrading212Connection).not.toHaveBeenCalled();
    expect(getInteractiveBrokersConnection).not.toHaveBeenCalled();
    expect(getPrimaryWallet).not.toHaveBeenCalled();
  });

  it("TRADING212: not connected yields UNAVAILABLE coverage, not a crash or a fabricated zero", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "TRADING212" }, message: "x", locale: "en" });
    expect(result.portfolios).toHaveLength(1);
    expect(result.portfolios[0].totalValue).toBeNull();
    expect(result.portfolios[0].coverage.status).toBe("UNAVAILABLE");
    expect(result.portfolios[0].coverage.message).toMatch(/not connected/i);
  });

  it("TRADING212: connected + fresh sync yields AVAILABLE with real totals", async () => {
    const now = new Date().toISOString();
    getTrading212Connection.mockResolvedValue({ status: "CONNECTED", createdAt: now, updatedAt: now, lastConnectedAt: now, lastSyncAt: now, syncStatus: "SYNCED", syncError: null, lastFailedSyncAt: null });
    getTrading212Portfolio.mockResolvedValue({
      accountId: "T212-1",
      account: { currencyCode: "EUR", totalValue: 5000, cashAvailable: 100, cashInPies: 0, cashReserved: 0, investedValue: 4900, realizedPnl: 0, unrealizedPnl: 200 },
      positions: [{ compassAssetId: "aapl", externalTicker: "AAPL", externalName: "Apple Inc.", currencyCode: "EUR", quantity: 10, averagePrice: 150, currentPrice: 170, unrealizedPnl: 200 }],
      lastSyncAt: now,
      syncStatus: "SYNCED",
      syncError: null,
      lastFailedSyncAt: null,
    });
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "TRADING212" }, message: "x", locale: "en" });
    expect(result.portfolios[0].coverage.status).toBe("AVAILABLE");
    expect(result.portfolios[0].totalValue).toBe(5000);
    expect(result.portfolios[0].positions[0]).toMatchObject({ source: "TRADING212", symbol: "AAPL", compassAssetId: "aapl" });
  });

  it("TRADING212: stale sync surfaces STALE status honestly, not AVAILABLE", async () => {
    const oldSync = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(); // 3 days old
    getTrading212Connection.mockResolvedValue({ status: "CONNECTED", createdAt: oldSync, updatedAt: oldSync, lastConnectedAt: oldSync, lastSyncAt: oldSync, syncStatus: "SYNCED", syncError: null, lastFailedSyncAt: null });
    getTrading212Portfolio.mockResolvedValue({ accountId: "T212-1", account: null, positions: [], lastSyncAt: oldSync, syncStatus: "SYNCED", syncError: null, lastFailedSyncAt: null });
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "TRADING212" }, message: "x", locale: "en" });
    expect(result.portfolios[0].coverage.status).toBe("STALE");
  });

  it("TRADING212: failed sync with a prior successful sync surfaces PARTIAL, not ERROR or AVAILABLE", async () => {
    const priorSync = new Date().toISOString();
    getTrading212Connection.mockResolvedValue({ status: "ERROR", createdAt: priorSync, updatedAt: priorSync, lastConnectedAt: priorSync, lastSyncAt: priorSync, syncStatus: "FAILED", syncError: "rate limited", lastFailedSyncAt: priorSync });
    getTrading212Portfolio.mockResolvedValue({ accountId: "T212-1", account: null, positions: [], lastSyncAt: priorSync, syncStatus: "FAILED", syncError: "rate limited", lastFailedSyncAt: priorSync });
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "TRADING212" }, message: "x", locale: "en" });
    expect(result.portfolios[0].coverage.status).toBe("PARTIAL");
  });

  it("IBKR: connected but never synced yields UNAVAILABLE, never a claimed empty portfolio", async () => {
    const now = new Date().toISOString();
    getInteractiveBrokersConnection.mockResolvedValue({ status: "CONNECTED", createdAt: now, updatedAt: now });
    getInteractiveBrokersPortfolio.mockResolvedValue(null);
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "IBKR" }, message: "x", locale: "en" });
    expect(result.portfolios[0].coverage.status).toBe("UNAVAILABLE");
    expect(result.portfolios[0].totalValue).toBeNull();
  });

  it("HYPERLIQUID: no linked wallet yields UNAVAILABLE with a clear reason", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "HYPERLIQUID" }, message: "x", locale: "en" });
    expect(result.portfolios[0].coverage.status).toBe("UNAVAILABLE");
    expect(getHyperliquidAccount).not.toHaveBeenCalled();
  });

  it("HYPERLIQUID: linked wallet but provider error yields ERROR, never a fabricated zero balance", async () => {
    getPrimaryWallet.mockResolvedValue({ address: "0xabc", chain: "arbitrum", createdAt: new Date().toISOString(), verifiedAt: null });
    getHyperliquidAccount.mockResolvedValue({ status: "unavailable", reason: "network timeout" });
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "HYPERLIQUID" }, message: "x", locale: "en" });
    expect(result.portfolios[0].coverage.status).toBe("ERROR");
    expect(result.portfolios[0].totalValue).toBeNull();
  });

  it("HYPERLIQUID: successful fetch maps perp positions with signed size, never as direct ownership", async () => {
    getPrimaryWallet.mockResolvedValue({ address: "0xabc", chain: "arbitrum", createdAt: new Date().toISOString(), verifiedAt: null });
    getHyperliquidAccount.mockResolvedValue({
      status: "ok",
      account: {
        accountValue: 2000,
        withdrawableBalance: 1500,
        totalMarginUsed: 500,
        positions: [{ coin: "AAPL", size: -2, entryPrice: 200, leverage: 3, liquidationPrice: 250, unrealizedPnl: -40, marginUsed: 133, positionValue: 400 }],
        timestamp: Date.now(),
      },
    });
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "HYPERLIQUID" }, message: "x", locale: "en" });
    expect(result.portfolios[0].coverage.status).toBe("AVAILABLE");
    expect(result.portfolios[0].totalValue).toBe(2000);
    expect(result.portfolios[0].positions[0]).toMatchObject({ source: "HYPERLIQUID", symbol: "AAPL", quantity: -2 });
  });
});

describe("buildFinancialContext — PORTFOLIO ALL — source isolation", () => {
  it("returns each source as its own separate snapshot, never summed into one total", async () => {
    getAccountView.mockResolvedValue({ ...EMPTY_PAPER, portfolioValue: 1000 });
    const now = new Date().toISOString();
    getTrading212Connection.mockResolvedValue({ status: "CONNECTED", createdAt: now, updatedAt: now, lastConnectedAt: now, lastSyncAt: now, syncStatus: "SYNCED", syncError: null, lastFailedSyncAt: null });
    getTrading212Portfolio.mockResolvedValue({ accountId: "T", account: { currencyCode: "EUR", totalValue: 2000, cashAvailable: 0, cashInPies: 0, cashReserved: 0, investedValue: 2000, realizedPnl: 0, unrealizedPnl: 0 }, positions: [], lastSyncAt: now, syncStatus: "SYNCED", syncError: null, lastFailedSyncAt: null });

    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "ALL" }, message: "x", locale: "en" });

    expect(result.portfolios).toHaveLength(4);
    const paper = result.portfolios.find((p) => p.source === "PAPER");
    const t212 = result.portfolios.find((p) => p.source === "TRADING212");
    expect(paper?.totalValue).toBe(1000);
    expect(t212?.totalValue).toBe(2000);
    // No combined/summed field exists anywhere on FinancialContext — each
    // snapshot keeps its own totalValue, which is the whole point.
    expect(Object.keys(result)).not.toContain("totalValue");
  });

  it("never presents a Paper position as if it were a real holding — Paper keeps its own distinct source tag", async () => {
    getAccountView.mockResolvedValue({ ...EMPTY_PAPER, portfolioValue: 500, positions: [{ assetId: "nvda", symbol: "NVDA", name: "NVIDIA Corp.", quantity: 1, averageEntryPrice: 400, currentPrice: 500, marketValue: 500, unrealizedPnl: 100, unrealizedPnlPercent: 25 }] });
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "ALL" }, message: "x", locale: "en" });
    const paper = result.portfolios.find((p) => p.source === "PAPER")!;
    expect(paper.positions[0].source).toBe("PAPER");
  });
});

describe("buildFinancialContext — HOME and PROFILE", () => {
  it("HOME fetches all four sources' summaries", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "HOME" }, message: "x", locale: "en" });
    expect(result.portfolios).toHaveLength(4);
  });

  it("PROFILE fetches all four sources' summaries too", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PROFILE" }, message: "x", locale: "en" });
    expect(result.portfolios).toHaveLength(4);
  });
});

describe("buildFinancialContext — ASSET context", () => {
  it("resolves the asset, its quote, cross-source exposure and related news", async () => {
    getQuotes.mockResolvedValue([{ slug: "nvda", status: "ok", quote: { slug: "nvda", symbol: "NVDA", name: "NVIDIA Corp.", price: 500, change: 10, changePercent: 2, timestamp: Date.now() } }]);
    getLatestNews.mockResolvedValue([{ id: "n1", title: "NVIDIA launches new chip", description: "d", source: "Reuters", url: "https://x", imageUrl: null, publishedAt: new Date().toISOString(), symbols: ["NVDA"], entities: [], category: "markets" }]);
    getAccountView.mockResolvedValue({ ...EMPTY_PAPER, positions: [{ assetId: "nvda", symbol: "NVDA", name: "NVIDIA Corp.", quantity: 2, averageEntryPrice: 400, currentPrice: 500, marketValue: 1000, unrealizedPnl: 200, unrealizedPnlPercent: 25 }] });

    const result = await buildFinancialContext({ userId: "u1", context: { type: "ASSET", assetId: "nvda" }, message: "Tell me about NVIDIA", locale: "en" });

    expect(result.asset?.assetId).toBe("nvda");
    expect(result.asset?.quote).toEqual({ price: 500, change: 10, changePercent: 2 });
    expect(result.asset?.exposure).toHaveLength(1);
    expect(result.asset?.exposure[0].source).toBe("PAPER");
    expect(result.asset?.relatedNews).toHaveLength(1);
  });

  it("returns no asset block for an unrecognized assetId rather than throwing", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "ASSET", assetId: "not-a-real-asset" }, message: "x", locale: "en" });
    expect(result.asset).toBeUndefined();
  });
});

describe("buildFinancialContext — NEWS context", () => {
  it("resolves the article, related assets by symbol, and cross-source exposure to those assets", async () => {
    getLatestNews.mockResolvedValue([{ id: "n1", title: "NVIDIA launches new chip", description: "d", source: "Reuters", url: "https://x", imageUrl: null, publishedAt: new Date().toISOString(), symbols: ["NVDA"], entities: [], category: "markets" }]);
    getAccountView.mockResolvedValue({ ...EMPTY_PAPER, positions: [{ assetId: "nvda", symbol: "NVDA", name: "NVIDIA Corp.", quantity: 2, averageEntryPrice: 400, currentPrice: 500, marketValue: 1000, unrealizedPnl: 200, unrealizedPnlPercent: 25 }] });

    const result = await buildFinancialContext({ userId: "u1", context: { type: "NEWS", articleId: "n1" }, message: "What does this mean for me?", locale: "en" });

    expect(result.news?.article?.title).toBe("NVIDIA launches new chip");
    expect(result.news?.relatedAssetIds).toContain("nvda");
    expect(result.news?.exposure).toHaveLength(1);
  });

  it("missing article yields article: null rather than throwing or fabricating one", async () => {
    getLatestNews.mockResolvedValue([]);
    const result = await buildFinancialContext({ userId: "u1", context: { type: "NEWS", articleId: "missing" }, message: "x", locale: "en" });
    expect(result.news?.article).toBeNull();
  });

  it("with no articleId (browsing the feed generally), still fetches portfolios but never a specific article/news block", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "NEWS" }, message: "How does inflation news affect my portfolio?", locale: "en" });
    expect(result.portfolios).toHaveLength(4);
    expect(result.news).toBeUndefined();
    expect(getLatestNews).not.toHaveBeenCalled();
  });
});

describe("buildFinancialContext — LEARNING context", () => {
  it("delegates to buildLearningContext with the given assetId/lessonId/locale", async () => {
    buildLearningContext.mockReturnValue({ assetId: "nvda", assetTitle: "NVIDIA", category: "tech", lessonId: "l1", lessonTitle: "Intro", objectives: [], concepts: [] });
    const result = await buildFinancialContext({ userId: "u1", context: { type: "LEARNING", assetId: "nvda", lessonId: "l1" }, message: "x", locale: "fr", learningDifficulty: "intermediate" });
    expect(buildLearningContext).toHaveBeenCalledWith(expect.objectContaining({ assetId: "nvda", lessonId: "l1", locale: "fr", difficulty: "intermediate" }));
    expect(result.learning?.lessonId).toBe("l1");
  });
});

describe("buildFinancialContext — connection contexts", () => {
  it("TRADING212_CONNECTION surfaces only that one source's coverage", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "TRADING212_CONNECTION" }, message: "x", locale: "en" });
    expect(result.portfolios).toHaveLength(1);
    expect(result.portfolios[0].source).toBe("TRADING212");
    expect(getInteractiveBrokersConnection).not.toHaveBeenCalled();
  });
});

describe("detectMentionedAssetId — 'what about NVIDIA?' follow-up handling (Section 7)", () => {
  it("matches a catalog symbol as a whole word, case-insensitively", () => {
    expect(detectMentionedAssetId("What about NVDA?")).toBe("nvda");
    expect(detectMentionedAssetId("what about nvda")).toBe("nvda");
  });

  it("matches a catalog asset's full name", () => {
    expect(detectMentionedAssetId("What about NVIDIA?")).toBe("nvda");
  });

  it("returns null when no catalog asset is mentioned", () => {
    expect(detectMentionedAssetId("Why did my portfolio fall today?")).toBeNull();
  });

  it("excludes the asset already being discussed so it isn't reported as a new mention", () => {
    expect(detectMentionedAssetId("Tell me more about NVIDIA", "nvda")).toBeNull();
  });
});

describe("buildFinancialContext — mentioned-asset enrichment", () => {
  it("enriches with a mentioned asset found in the message even outside ASSET context", async () => {
    getQuotes.mockResolvedValue([{ slug: "nvda", status: "ok", quote: { slug: "nvda", symbol: "NVDA", name: "NVIDIA Corp.", price: 500, change: 1, changePercent: 0.2, timestamp: Date.now() } }]);
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "TRADING212" }, message: "What about NVIDIA?", locale: "en" });
    expect(result.mentionedAsset?.assetId).toBe("nvda");
  });

  it("does not enrich when the message mentions nothing from the catalog", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "TRADING212" }, message: "Why did my portfolio fall today?", locale: "en" });
    expect(result.mentionedAsset).toBeUndefined();
  });
});

describe("buildFinancialContext — provider-limitation coverage list (Section 10/11)", () => {
  it("coverage array always reflects every fetched portfolio's real status, never omitting an unavailable one", async () => {
    const result = await buildFinancialContext({ userId: "u1", context: { type: "PORTFOLIO", source: "ALL" }, message: "x", locale: "en" });
    expect(result.coverage).toHaveLength(4);
    const ibkr = result.coverage.find((c) => c.provider === "interactive_brokers");
    expect(ibkr?.status).toBe("UNAVAILABLE");
    expect(ibkr?.message).not.toBeNull();
  });
});
