import { prisma } from "@/server/db/prisma";
import {
  createSnapshot,
  deletePosition,
  getLatestSnapshot,
  getOrCreateAccount,
  getPosition,
  getPositions,
  getSnapshotsSince,
  getTrades,
  recordTrade,
  updateCashBalance,
  upsertPosition,
} from "@/server/repositories/paper-trading-repository";
import { getAsset, isAssetId } from "@/lib/assets/catalog";
import { getQuote, getQuotes } from "@/server/market/service";
import { isInvestmentUnlocked } from "@/lib/learning/unlocks";
import { getServerLearningProgress } from "@/server/repositories/learning-repository";
import { notifyUser } from "./notification-events";
import {
  PaperAccountView,
  PaperPositionView,
  PaperTradeView,
  PerformancePoint,
  PerformanceRange,
  TradeSide,
} from "@/lib/trading/types";

// How long a recorded snapshot is considered "fresh enough" before
// getAccountView() records a new one. This is a throttle on how often we
// write to the DB, not a fabrication of data — every snapshot ever
// written is a real portfolioValue computed from real live quotes at the
// moment it was taken. Short enough that a demo/practice app actually
// accumulates a visible history within a single session; a production
// deployment trading real money would likely widen this to e.g. 1 day.
const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60_000;

const RANGE_LOOKBACK_MS: Record<PerformanceRange, number | null> = {
  "1D": 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000,
  "1M": 30 * 24 * 60 * 60_000,
  "3M": 90 * 24 * 60 * 60_000,
  "1Y": 365 * 24 * 60 * 60_000,
  ALL: null,
};

// A tiny epsilon so floating-point SELL quantities that are "close enough"
// to a position's full quantity (e.g. selling 0.1+0.2 worth of BTC bought
// in two lots) are treated as a full close instead of leaving a
// microscopic residual position behind forever.
const QUANTITY_EPSILON = 1e-9;

export class TradingError extends Error {}

function assertValidTradeInput(assetId: string, side: string, quantity: number): void {
  if (!isAssetId(assetId)) {
    throw new TradingError(`Unknown asset: ${assetId}`);
  }
  if (side !== "BUY" && side !== "SELL") {
    throw new TradingError(`Invalid side: ${side}`);
  }
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new TradingError("Quantity must be a positive number");
  }
}

/**
 * Executes one BUY or SELL as a single atomic database transaction: cash,
 * position, and the trade record all succeed or all fail together — see
 * Milestone 16 Section 15. Always prices the trade off a live quote
 * fetched just before the transaction; never a client-supplied or stale
 * price, and never invented when the quote is unavailable (the trade is
 * simply refused in that case).
 */
export async function placePaperTrade(
  userId: string,
  assetId: string,
  side: TradeSide,
  quantity: number
): Promise<PaperAccountView> {
  assertValidTradeInput(assetId, side, quantity);

  const instrument = getAsset(assetId);
  if (!instrument) {
    throw new TradingError(`Unknown asset: ${assetId}`);
  }

  // Milestone 23: the investment-unlock system (Markets, Learning
  // Progress, the asset entry screen) only ever DISPLAYED lock status —
  // nothing here actually enforced it, so a BUY could be placed directly
  // against this API for an asset the learner hadn't unlocked, entirely
  // bypassing the UI. Same source of truth as everywhere else
  // (isInvestmentUnlocked from unlocks.ts), not a second calculation.
  // Only gates BUY: selling out of a position you already hold is always
  // allowed regardless of current unlock state.
  if (side === "BUY") {
    const progress = await getServerLearningProgress(userId);
    if (!isInvestmentUnlocked(assetId, progress)) {
      throw new TradingError(
        `${instrument.name} isn't unlocked for investing yet — complete the required learning stage first.`
      );
    }
  }

  const quoteResult = await getQuote(assetId);
  if (quoteResult.status !== "ok") {
    throw new TradingError(
      `Market data unavailable for ${instrument.name} — try again shortly.`
    );
  }
  const price = quoteResult.quote.price;

  await prisma.$transaction(async (tx) => {
    const account = await getOrCreateAccount(tx, userId);
    const existingPosition = await getPosition(tx, account.id, assetId);

    if (side === "BUY") {
      const cost = quantity * price;
      if (cost > account.cashBalance + QUANTITY_EPSILON) {
        throw new TradingError("Insufficient cash for this trade");
      }

      const newQuantity = (existingPosition?.quantity ?? 0) + quantity;
      const newAverageEntryPrice = existingPosition
        ? (existingPosition.quantity * existingPosition.averageEntryPrice + quantity * price) /
          newQuantity
        : price;

      await updateCashBalance(tx, account.id, account.cashBalance - cost);
      await upsertPosition(tx, account.id, assetId, newQuantity, newAverageEntryPrice);
      await recordTrade(tx, {
        accountId: account.id,
        assetId,
        side: "BUY",
        quantity,
        executionPrice: price,
        realizedPnl: null,
      });
      return;
    }

    // SELL
    if (!existingPosition || existingPosition.quantity < quantity - QUANTITY_EPSILON) {
      throw new TradingError("Insufficient position to sell that quantity");
    }

    const proceeds = quantity * price;
    const realizedPnl = (price - existingPosition.averageEntryPrice) * quantity;
    const remainingQuantity = existingPosition.quantity - quantity;

    await updateCashBalance(tx, account.id, account.cashBalance + proceeds);
    if (remainingQuantity <= QUANTITY_EPSILON) {
      await deletePosition(tx, account.id, assetId);
    } else {
      await upsertPosition(tx, account.id, assetId, remainingQuantity, existingPosition.averageEntryPrice);
    }
    await recordTrade(tx, {
      accountId: account.id,
      assetId,
      side: "SELL",
      quantity,
      executionPrice: price,
      realizedPnl,
    });
  });

  await notifyUser(userId, "paper_trade_completed", `${assetId}:${side}`);

  return getAccountView(userId);
}

/**
 * Reads the account and every open position, prices them off live quotes,
 * and derives portfolioValue/investedValue/unrealizedPnl. Positions whose
 * quote is currently unavailable are excluded from those sums (never
 * given a fabricated price) and listed in pricesUnavailableFor instead.
 */
export async function getAccountView(userId: string): Promise<PaperAccountView> {
  const account = await getOrCreateAccount(prisma, userId);
  const [positionRows, tradeRows] = await Promise.all([
    getPositions(prisma, account.id),
    getTrades(prisma, account.id),
  ]);

  const quotes =
    positionRows.length > 0 ? await getQuotes(positionRows.map((p) => p.assetId)) : [];
  const quoteByAssetId = new Map(quotes.map((q) => [q.slug, q]));

  const positions: PaperPositionView[] = [];
  const pricesUnavailableFor: string[] = [];
  let investedValue = 0;
  let unrealizedPnl = 0;

  for (const row of positionRows) {
    const instrument = getAsset(row.assetId);
    if (!instrument) continue; // defensive — every stored assetId was validated at trade time

    const quote = quoteByAssetId.get(row.assetId);
    const currentPrice = quote?.status === "ok" ? quote.quote.price : null;

    if (currentPrice == null) {
      pricesUnavailableFor.push(row.assetId);
      positions.push({
        assetId: instrument.id,
        symbol: instrument.symbol,
        name: instrument.name,
        quantity: row.quantity,
        averageEntryPrice: row.averageEntryPrice,
        currentPrice: null,
        marketValue: null,
        unrealizedPnl: null,
        unrealizedPnlPercent: null,
      });
      continue;
    }

    const marketValue = row.quantity * currentPrice;
    const positionUnrealizedPnl = (currentPrice - row.averageEntryPrice) * row.quantity;
    const costBasis = row.quantity * row.averageEntryPrice;
    const unrealizedPnlPercent = costBasis !== 0 ? (positionUnrealizedPnl / costBasis) * 100 : 0;

    investedValue += marketValue;
    unrealizedPnl += positionUnrealizedPnl;

    positions.push({
      assetId: instrument.id,
      symbol: instrument.symbol,
      name: instrument.name,
      quantity: row.quantity,
      averageEntryPrice: row.averageEntryPrice,
      currentPrice,
      marketValue,
      unrealizedPnl: positionUnrealizedPnl,
      unrealizedPnlPercent,
    });
  }

  const trades: PaperTradeView[] = tradeRows.map((t) => ({
    id: t.id,
    assetId: t.assetId as PaperTradeView["assetId"],
    side: t.side as TradeSide,
    quantity: t.quantity,
    executionPrice: t.executionPrice,
    realizedPnl: t.realizedPnl,
    createdAt: t.createdAt.toISOString(),
  }));

  const realizedPnl = trades.reduce((sum, t) => sum + (t.realizedPnl ?? 0), 0);
  const portfolioValue = account.cashBalance + investedValue;

  await maybeRecordSnapshot(account.id, portfolioValue, account.cashBalance);

  return {
    cashBalance: account.cashBalance,
    portfolioValue,
    investedValue,
    unrealizedPnl,
    realizedPnl,
    positions: positions as PaperPositionView[],
    trades,
    pricesUnavailableFor: pricesUnavailableFor as PaperAccountView["pricesUnavailableFor"],
  };
}

/**
 * Records a real portfolio-value snapshot, throttled to at most one every
 * SNAPSHOT_MIN_INTERVAL_MS — see that constant's comment. Never blocks or
 * fails the caller: a snapshot-write problem shouldn't take down account
 * reads, so errors here are swallowed after logging.
 */
async function maybeRecordSnapshot(
  accountId: string,
  portfolioValue: number,
  cashBalance: number
): Promise<void> {
  try {
    const latest = await getLatestSnapshot(prisma, accountId);
    const dueForSnapshot =
      !latest || Date.now() - latest.createdAt.getTime() >= SNAPSHOT_MIN_INTERVAL_MS;
    if (dueForSnapshot) {
      await createSnapshot(prisma, accountId, portfolioValue, cashBalance);
    }
  } catch (err) {
    console.error("[trading-service] failed to record portfolio snapshot:", err);
  }
}

/**
 * Real portfolio-value history for the given range — every point is
 * either an actually-recorded snapshot or the current live value (the
 * final point, always appended so the chart's right edge is never stale
 * by more than a page load). Never interpolated, never a fabricated
 * trend. Returns whatever history genuinely exists — a brand-new account
 * legitimately returns just the one current-value point.
 */
export async function getPerformanceHistory(
  userId: string,
  range: PerformanceRange
): Promise<PerformancePoint[]> {
  // getAccountView() both gives us the current live-priced value AND (as
  // a side effect) records a throttled snapshot, so calling it here is
  // what makes sure "today's" point actually exists once someone views
  // performance history, not just on trades.
  const current = await getAccountView(userId);
  const account = await getOrCreateAccount(prisma, userId);

  const lookbackMs = RANGE_LOOKBACK_MS[range];
  const since = lookbackMs != null ? new Date(Date.now() - lookbackMs) : null;

  const snapshots = await getSnapshotsSince(prisma, account.id, since);
  const points: PerformancePoint[] = snapshots.map((s) => ({
    t: s.createdAt.getTime(),
    v: s.portfolioValue,
  }));

  // Always end on the current, live-priced value — computed the same way
  // getAccountView() computes it, not just re-reading the last snapshot
  // (which may be up to SNAPSHOT_MIN_INTERVAL_MS stale).
  const now = Date.now();
  const last = points[points.length - 1];
  if (!last || now - last.t > 1000) {
    points.push({ t: now, v: current.portfolioValue });
  }

  return points;
}
