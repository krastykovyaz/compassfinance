import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = {
  getOrCreateAccount: vi.fn(),
  getPosition: vi.fn(),
  getPositions: vi.fn(),
  getTrades: vi.fn(),
  updateCashBalance: vi.fn(),
  upsertPosition: vi.fn(),
  deletePosition: vi.fn(),
  recordTrade: vi.fn(),
  getLatestSnapshot: vi.fn(),
  createSnapshot: vi.fn(),
  getSnapshotsSince: vi.fn(),
};

vi.mock("@/server/repositories/paper-trading-repository", () => ({
  getOrCreateAccount: (...args: unknown[]) => repo.getOrCreateAccount(...args),
  getPosition: (...args: unknown[]) => repo.getPosition(...args),
  getPositions: (...args: unknown[]) => repo.getPositions(...args),
  getTrades: (...args: unknown[]) => repo.getTrades(...args),
  updateCashBalance: (...args: unknown[]) => repo.updateCashBalance(...args),
  upsertPosition: (...args: unknown[]) => repo.upsertPosition(...args),
  deletePosition: (...args: unknown[]) => repo.deletePosition(...args),
  recordTrade: (...args: unknown[]) => repo.recordTrade(...args),
  getLatestSnapshot: (...args: unknown[]) => repo.getLatestSnapshot(...args),
  createSnapshot: (...args: unknown[]) => repo.createSnapshot(...args),
  getSnapshotsSince: (...args: unknown[]) => repo.getSnapshotsSince(...args),
}));

const getQuote = vi.fn();
const getQuotes = vi.fn();
vi.mock("@/server/market/service", () => ({
  getQuote: (...args: unknown[]) => getQuote(...args),
  getQuotes: (...args: unknown[]) => getQuotes(...args),
}));

const getServerLearningProgress = vi.fn();
vi.mock("@/server/repositories/learning-repository", () => ({
  getServerLearningProgress: (...args: unknown[]) => getServerLearningProgress(...args),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<void>) => fn({}),
  },
}));

// Milestone 25: placePaperTrade now fires the real notification-events
// integration after a trade commits. This test file is about trading
// mechanics, not notifications, so that call is mocked out here the same
// way market/service and learning-repository already are above.
const notifyUser = vi.fn();
vi.mock("./notification-events", () => ({
  notifyUser: (...args: unknown[]) => notifyUser(...args),
}));

import { getAccountView, getPerformanceHistory, placePaperTrade, TradingError } from "./trading-service";

const ACCOUNT = { id: "acct-1", userId: "user-1", cashBalance: 1000 };

// Full completed progress — the default for every existing test in this
// file, so BUY tests using gated assets like "aapl" keep exercising
// trade mechanics without being about the unlock gate itself. Tests that
// ARE about the gate (below) explicitly override this per-case.
const FULLY_UNLOCKED_PROGRESS = {
  totalXP: 100000,
  level: 10,
  lessonsCompleted: 13,
  quizzesCompleted: 13,
  correctAnswers: 100,
  currentStreak: 30,
  longestStreak: 30,
  assetsExplored: 13,
  investmentsMade: 10,
  distinctAssetsInvested: 10,
  unlockedAchievements: ["FIRST_LESSON", "FIRST_QUIZ", "STOCK_EXPLORER", "FIRST_INVESTMENT", "DIVERSIFIED"],
  completedLessons: ["sp500", "nasdaq", "aapl", "tsla", "nvda"],
  lastActivityAt: new Date().toISOString(),
};

let tradeIdSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  tradeIdSeq = 0;
  getServerLearningProgress.mockResolvedValue(FULLY_UNLOCKED_PROGRESS);
  repo.getOrCreateAccount.mockResolvedValue(ACCOUNT);
  repo.getPositions.mockResolvedValue([]);
  repo.getTrades.mockResolvedValue([]);
  repo.getLatestSnapshot.mockResolvedValue(null);
  repo.createSnapshot.mockResolvedValue({});
  repo.getSnapshotsSince.mockResolvedValue([]);
  // recordTrade returns a real, unique row id per call — placePaperTrade
  // uses this as the notification dedup key (see below), so every mocked
  // trade needs its own id the same way the real DB would generate one.
  repo.recordTrade.mockImplementation(async () => ({ id: `trade-${++tradeIdSeq}` }));
});

describe("placePaperTrade — investment-unlock enforcement (Milestone 23)", () => {
  it("rejects a BUY for a gated asset the learner hasn't unlocked — server-side, not just a hidden UI button", async () => {
    getServerLearningProgress.mockResolvedValue({
      ...FULLY_UNLOCKED_PROGRESS,
      completedLessons: [], // nothing done — nasdaq is still locked
      unlockedAchievements: [],
    });
    getQuote.mockResolvedValue({ slug: "nasdaq", status: "ok", quote: { price: 500 } });

    await expect(placePaperTrade("user-1", "nasdaq", "BUY", 1)).rejects.toThrow(TradingError);
    expect(repo.recordTrade).not.toHaveBeenCalled();
    expect(repo.updateCashBalance).not.toHaveBeenCalled();
  });

  it("allows a BUY once the asset is genuinely unlocked", async () => {
    getServerLearningProgress.mockResolvedValue({
      ...FULLY_UNLOCKED_PROGRESS,
      completedLessons: ["sp500", "nasdaq"],
    });
    getQuote.mockResolvedValue({ slug: "nasdaq", status: "ok", quote: { price: 500 } });
    repo.getPosition.mockResolvedValue(null);
    getQuotes.mockResolvedValue([]);
    repo.getPositions.mockResolvedValue([]);

    await placePaperTrade("user-1", "nasdaq", "BUY", 1);
    expect(repo.recordTrade).toHaveBeenCalled();
  });

  it("gates a BUY on a single-stage asset (e.g. btc) until its own lesson is completed — no prerequisite chain needed", async () => {
    // Corrected from a stale "free-standing, ungated asset" assumption:
    // every catalog asset now has its own investment-unlock stage (see
    // INVESTMENT_UNLOCK_STAGES in unlocks.ts); btc's stage just has no
    // prerequisiteAssetId, so completing its own lesson is sufficient.
    getServerLearningProgress.mockResolvedValue({
      ...FULLY_UNLOCKED_PROGRESS,
      completedLessons: [],
      unlockedAchievements: [],
    });
    getQuote.mockResolvedValue({ slug: "btc", status: "ok", quote: { price: 100 } });
    repo.getPosition.mockResolvedValue(null);
    getQuotes.mockResolvedValue([]);
    repo.getPositions.mockResolvedValue([]);

    await expect(placePaperTrade("user-1", "btc", "BUY", 1)).rejects.toThrow(TradingError);
    expect(repo.recordTrade).not.toHaveBeenCalled();

    getServerLearningProgress.mockResolvedValue({
      ...FULLY_UNLOCKED_PROGRESS,
      completedLessons: ["btc"],
      unlockedAchievements: [],
    });
    await placePaperTrade("user-1", "btc", "BUY", 1);
    expect(repo.recordTrade).toHaveBeenCalled();
  });

  it("always allows a SELL of an existing position, even for a gated asset, regardless of current unlock state", async () => {
    getServerLearningProgress.mockResolvedValue({
      ...FULLY_UNLOCKED_PROGRESS,
      completedLessons: [], // locked right now
      unlockedAchievements: [],
    });
    getQuote.mockResolvedValue({ slug: "nasdaq", status: "ok", quote: { price: 500 } });
    repo.getPosition.mockResolvedValue({
      id: "p1",
      accountId: "acct-1",
      assetId: "nasdaq",
      quantity: 1,
      averageEntryPrice: 400,
    });
    getQuotes.mockResolvedValue([]);
    repo.getPositions.mockResolvedValue([]);

    await placePaperTrade("user-1", "nasdaq", "SELL", 1);
    expect(repo.recordTrade).toHaveBeenCalled();
  });
});

describe("placePaperTrade — validation", () => {
  it("rejects an unknown asset", async () => {
    await expect(placePaperTrade("user-1", "doge", "BUY", 1)).rejects.toThrow(TradingError);
  });

  it("rejects an invalid side", async () => {
    await expect(
      placePaperTrade("user-1", "aapl", "HOLD" as never, 1)
    ).rejects.toThrow(TradingError);
  });

  it("rejects a zero or negative quantity", async () => {
    await expect(placePaperTrade("user-1", "aapl", "BUY", 0)).rejects.toThrow(TradingError);
    await expect(placePaperTrade("user-1", "aapl", "BUY", -5)).rejects.toThrow(TradingError);
  });

  it("rejects a non-finite quantity", async () => {
    await expect(placePaperTrade("user-1", "aapl", "BUY", NaN)).rejects.toThrow(TradingError);
  });

  it("refuses the trade (never invents a price) when market data is unavailable", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "unavailable", reason: "no data" });
    await expect(placePaperTrade("user-1", "aapl", "BUY", 1)).rejects.toThrow(TradingError);
    expect(repo.recordTrade).not.toHaveBeenCalled();
  });
});

describe("placePaperTrade — BUY", () => {
  it("with sufficient cash: decreases cash, opens a position, records the trade", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "ok", quote: { price: 100 } });
    repo.getPosition.mockResolvedValue(null);
    getQuotes.mockResolvedValue([]); // for the getAccountView() call at the end
    repo.getPositions.mockResolvedValue([]);

    await placePaperTrade("user-1", "aapl", "BUY", 2);

    expect(repo.updateCashBalance).toHaveBeenCalledWith(expect.anything(), "acct-1", 800); // 1000 - 200
    expect(repo.upsertPosition).toHaveBeenCalledWith(expect.anything(), "acct-1", "aapl", 2, 100);
    expect(repo.recordTrade).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ side: "BUY", quantity: 2, executionPrice: 100, realizedPnl: null })
    );
  });

  it("with insufficient cash: rejects, never partially updates", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "ok", quote: { price: 100 } });
    repo.getPosition.mockResolvedValue(null);

    await expect(placePaperTrade("user-1", "aapl", "BUY", 20)).rejects.toThrow(TradingError); // costs 2000, only 1000 cash

    expect(repo.updateCashBalance).not.toHaveBeenCalled();
    expect(repo.upsertPosition).not.toHaveBeenCalled();
    expect(repo.recordTrade).not.toHaveBeenCalled();
  });

  it("recalculates a weighted average entry price on an additional buy", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "ok", quote: { price: 150 } });
    repo.getPosition.mockResolvedValue({
      id: "p1",
      accountId: "acct-1",
      assetId: "aapl",
      quantity: 2,
      averageEntryPrice: 100,
    });
    getQuotes.mockResolvedValue([]);
    repo.getPositions.mockResolvedValue([]);

    await placePaperTrade("user-1", "aapl", "BUY", 2);

    // (2*100 + 2*150) / 4 = 125
    expect(repo.upsertPosition).toHaveBeenCalledWith(expect.anything(), "acct-1", "aapl", 4, 125);
  });
});

describe("placePaperTrade — SELL", () => {
  it("with sufficient position: increases cash, reduces quantity, records realized P&L", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "ok", quote: { price: 120 } });
    repo.getPosition.mockResolvedValue({
      id: "p1",
      accountId: "acct-1",
      assetId: "aapl",
      quantity: 5,
      averageEntryPrice: 100,
    });
    getQuotes.mockResolvedValue([]);
    repo.getPositions.mockResolvedValue([]);

    await placePaperTrade("user-1", "aapl", "SELL", 2);

    expect(repo.updateCashBalance).toHaveBeenCalledWith(expect.anything(), "acct-1", 1240); // 1000 + 2*120
    expect(repo.upsertPosition).toHaveBeenCalledWith(expect.anything(), "acct-1", "aapl", 3, 100);
    expect(repo.recordTrade).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ side: "SELL", quantity: 2, executionPrice: 120, realizedPnl: 40 }) // (120-100)*2
    );
  });

  it("with insufficient position: rejects, never partially updates", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "ok", quote: { price: 120 } });
    repo.getPosition.mockResolvedValue({
      id: "p1",
      accountId: "acct-1",
      assetId: "aapl",
      quantity: 1,
      averageEntryPrice: 100,
    });

    await expect(placePaperTrade("user-1", "aapl", "SELL", 5)).rejects.toThrow(TradingError);
    expect(repo.updateCashBalance).not.toHaveBeenCalled();
    expect(repo.recordTrade).not.toHaveBeenCalled();
  });

  it("with no position at all: rejects", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "ok", quote: { price: 120 } });
    repo.getPosition.mockResolvedValue(null);

    await expect(placePaperTrade("user-1", "aapl", "SELL", 1)).rejects.toThrow(TradingError);
  });

  it("selling the full quantity closes (deletes) the position", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "ok", quote: { price: 120 } });
    repo.getPosition.mockResolvedValue({
      id: "p1",
      accountId: "acct-1",
      assetId: "aapl",
      quantity: 3,
      averageEntryPrice: 100,
    });
    getQuotes.mockResolvedValue([]);
    repo.getPositions.mockResolvedValue([]);

    await placePaperTrade("user-1", "aapl", "SELL", 3);

    expect(repo.deletePosition).toHaveBeenCalledWith(expect.anything(), "acct-1", "aapl");
    expect(repo.upsertPosition).not.toHaveBeenCalled();
  });
});

describe("getAccountView", () => {
  it("computes portfolioValue as cash + sum(quantity * currentPrice)", async () => {
    repo.getPositions.mockResolvedValue([
      { id: "p1", accountId: "acct-1", assetId: "aapl", quantity: 2, averageEntryPrice: 100 },
      { id: "p2", accountId: "acct-1", assetId: "btc", quantity: 0.5, averageEntryPrice: 20000 },
    ]);
    getQuotes.mockResolvedValue([
      { slug: "aapl", status: "ok", quote: { price: 150 } },
      { slug: "btc", status: "ok", quote: { price: 22000 } },
    ]);

    const view = await getAccountView("user-1");

    // invested = 2*150 + 0.5*22000 = 300 + 11000 = 11300
    expect(view.investedValue).toBe(11300);
    expect(view.portfolioValue).toBe(1000 + 11300);
    expect(view.pricesUnavailableFor).toEqual([]);
  });

  it("excludes a position from the totals when its price is unavailable, and lists it separately", async () => {
    repo.getPositions.mockResolvedValue([
      { id: "p1", accountId: "acct-1", assetId: "aapl", quantity: 2, averageEntryPrice: 100 },
      { id: "p2", accountId: "acct-1", assetId: "gold", quantity: 1, averageEntryPrice: 2000 },
    ]);
    getQuotes.mockResolvedValue([
      { slug: "aapl", status: "ok", quote: { price: 150 } },
      { slug: "gold", status: "unavailable", reason: "down" },
    ]);

    const view = await getAccountView("user-1");

    expect(view.investedValue).toBe(300); // only aapl counted
    expect(view.pricesUnavailableFor).toEqual(["gold"]);
    const goldPosition = view.positions.find((p) => p.assetId === "gold");
    expect(goldPosition?.currentPrice).toBeNull();
    expect(goldPosition?.marketValue).toBeNull();
  });

  it("sums realizedPnl across every SELL trade", async () => {
    repo.getPositions.mockResolvedValue([]);
    repo.getTrades.mockResolvedValue([
      {
        id: "t1",
        accountId: "acct-1",
        assetId: "aapl",
        side: "SELL",
        quantity: 1,
        executionPrice: 120,
        realizedPnl: 20,
        createdAt: new Date(),
      },
      {
        id: "t2",
        accountId: "acct-1",
        assetId: "btc",
        side: "SELL",
        quantity: 1,
        executionPrice: 21000,
        realizedPnl: 1000,
        createdAt: new Date(),
      },
    ]);

    const view = await getAccountView("user-1");
    expect(view.realizedPnl).toBe(1020);
  });

  it("returns an empty portfolio (cash only) for a brand-new account with no positions", async () => {
    const view = await getAccountView("user-1");
    expect(view.positions).toEqual([]);
    expect(view.investedValue).toBe(0);
    expect(view.portfolioValue).toBe(1000);
  });
});

describe("getAccountView — snapshot recording (real portfolio history)", () => {
  it("records a snapshot when none exists yet", async () => {
    repo.getLatestSnapshot.mockResolvedValue(null);
    await getAccountView("user-1");
    expect(repo.createSnapshot).toHaveBeenCalledWith(expect.anything(), "acct-1", 1000, 1000);
  });

  it("does not record a new snapshot when the latest one is still fresh", async () => {
    repo.getLatestSnapshot.mockResolvedValue({
      id: "s1",
      accountId: "acct-1",
      portfolioValue: 1000,
      cashBalance: 1000,
      createdAt: new Date(), // just now — well within the throttle window
    });
    await getAccountView("user-1");
    expect(repo.createSnapshot).not.toHaveBeenCalled();
  });

  it("records a new snapshot once the latest one is stale", async () => {
    repo.getLatestSnapshot.mockResolvedValue({
      id: "s1",
      accountId: "acct-1",
      portfolioValue: 900,
      cashBalance: 900,
      createdAt: new Date(Date.now() - 60 * 60_000), // an hour ago
    });
    await getAccountView("user-1");
    expect(repo.createSnapshot).toHaveBeenCalled();
  });

  it("never lets a snapshot-write failure break the account read", async () => {
    repo.getLatestSnapshot.mockRejectedValue(new Error("db down"));
    const view = await getAccountView("user-1");
    expect(view.portfolioValue).toBe(1000); // still returns a real value
  });
});

describe("getPerformanceHistory", () => {
  it("returns real recorded snapshots plus the current live value as the final point", async () => {
    const oldSnapshot = {
      id: "s1",
      accountId: "acct-1",
      portfolioValue: 950,
      cashBalance: 950,
      createdAt: new Date(Date.now() - 60 * 60_000),
    };
    repo.getSnapshotsSince.mockResolvedValue([oldSnapshot]);
    repo.getLatestSnapshot.mockResolvedValue(oldSnapshot);

    const points = await getPerformanceHistory("user-1", "1D");

    expect(points[0]).toEqual({ t: oldSnapshot.createdAt.getTime(), v: 950 });
    expect(points[points.length - 1].v).toBe(1000); // current live portfolioValue (cash only, no positions)
  });

  it("never fabricates a point — an account with no history returns just the current value", async () => {
    repo.getSnapshotsSince.mockResolvedValue([]);
    repo.getLatestSnapshot.mockResolvedValue(null);

    const points = await getPerformanceHistory("user-1", "ALL");

    expect(points).toHaveLength(1);
    expect(points[0].v).toBe(1000);
  });
});

describe("placePaperTrade — notification dedup key (regression)", () => {
  it("uses the trade's own id, not `${assetId}:${side}`, so two BUYs of the same asset each notify", async () => {
    getQuote.mockResolvedValue({ slug: "aapl", status: "ok", quote: { price: 100 } });
    repo.getPosition.mockResolvedValue(null);
    getQuotes.mockResolvedValue([]);
    repo.getPositions.mockResolvedValue([]);

    await placePaperTrade("user-1", "aapl", "BUY", 1);
    repo.getPosition.mockResolvedValue({
      id: "p1",
      accountId: "acct-1",
      assetId: "aapl",
      quantity: 1,
      averageEntryPrice: 100,
    });
    await placePaperTrade("user-1", "aapl", "BUY", 1);

    expect(notifyUser).toHaveBeenCalledTimes(2);
    const firstSourceId = notifyUser.mock.calls[0][2];
    const secondSourceId = notifyUser.mock.calls[1][2];
    expect(firstSourceId).not.toBe(secondSourceId); // never `${assetId}:${side}` for both
    expect(notifyUser).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "paper_trade_completed",
      expect.any(String),
      { assetId: "aapl", tradeSide: "BUY" }
    );
  });
});
