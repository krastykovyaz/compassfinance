import "server-only";
import { getAccountView } from "@/server/services/trading-service";
import { getTrading212Portfolio } from "@/server/repositories/trading212-portfolio-repository";
import { getTrading212Connection } from "@/server/repositories/trading212-repository";
import { getInteractiveBrokersPortfolio } from "@/server/repositories/interactive-brokers-portfolio-repository";
import { getInteractiveBrokersConnection } from "@/server/repositories/interactive-brokers-repository";
import { getPrimaryWallet } from "@/server/repositories/wallet-repository";
import { getHyperliquidAccount } from "@/server/hyperliquid/service";
import { getQuotes } from "@/server/market/service";
import { getNewsProvider } from "@/lib/news/news-provider";
import { findNewsById, filterNewsBySlug, type NewsItem } from "@/lib/news/news-types";
import { getAsset, ALL_ASSETS, type AssetCatalogEntry } from "@/lib/assets/catalog";
import { getAssetIdForHyperliquidCoin } from "@/lib/hyperliquid/asset-mapping";
import { classifyTrading212Staleness } from "@/lib/trading212/sync-state";
import { buildLearningContext, type LearningContext } from "@/lib/ai/curriculum-context";
import type { DifficultyLevel } from "@/lib/ai/difficulty";
import type { Locale } from "@/lib/i18n/types";
import type { CompassContext, PortfolioContextSource } from "@/lib/compass/context";

// The Financial Context Builder (Phase 4, Section 9/10). Builds ONLY the
// data a given CompassContext + message actually needs (Section 38: "do
// not send every transaction/every position/the entire database") by
// calling each provider's OWN already-existing repository/service —
// nothing here re-implements a valuation, a sync check, or a query any
// provider integration doesn't already expose (Section 9: "do not
// duplicate provider logic").
//
// Every financial fact carries explicit provenance (Section 10): which
// provider, when it was last synced, and a DataStatus that the prompt
// builder turns into instructions like "this is PARTIAL — say so, never
// treat missing as zero." UNAVAILABLE/ERROR data is never silently
// omitted from the coverage list — Compass must be ABLE to say "I don't
// have that" rather than just quietly not mentioning a source at all.

export type DataStatus = "AVAILABLE" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "ERROR";

export type DataCoverage = {
  provider: string; // "paper" | "trading212" | "interactive_brokers" | "hyperliquid"
  status: DataStatus;
  lastSyncedAt: string | null;
  /** Human-readable reason, required whenever status isn't AVAILABLE —
   * this is the literal sentence the prompt tells the model it may use
   * (Section 10's own worked example: "IBKR fee data isn't available
   * through the current connected API source"). */
  message: string | null;
};

export type FinancialPosition = {
  source: PortfolioContextSource;
  symbol: string;
  name: string | null;
  compassAssetId: string | null;
  quantity: number | null;
  value: number | null;
  currency: string | null;
  unrealizedPnl: number | null;
};

export type PortfolioSnapshot = {
  source: PortfolioContextSource;
  coverage: DataCoverage;
  totalValue: number | null;
  currency: string | null;
  unrealizedPnl: number | null;
  positions: FinancialPosition[];
};

export type AssetContextData = {
  assetId: string;
  name: string;
  symbol: string;
  category: string;
  quote: { price: number; change: number; changePercent: number } | null;
  /** This asset's position across every REAL/paper source the user has —
   * each entry keeps its own `source` tag, per the hard "never silently
   * mix Paper with real portfolios" rule (Section 8) — a caller renders
   * these as separate rows, never summed. */
  exposure: FinancialPosition[];
  relatedNews: { title: string; source: string; url: string; publishedAt: string }[];
};

export type NewsContextData = {
  article: { title: string; description: string; source: string; url: string; publishedAt: string; symbols: string[] } | null;
  relatedAssetIds: string[];
  exposure: FinancialPosition[];
};

export type FinancialContext = {
  portfolios: PortfolioSnapshot[];
  asset?: AssetContextData;
  news?: NewsContextData;
  learning?: LearningContext;
  /** Populated only when the user's message mentions a DIFFERENT catalog
   * asset than the current context's own (Section 7's "what about
   * NVIDIA?" example) — a lightweight, deterministic keyword match
   * against the catalog, not full NLU (see detectMentionedAsset below). */
  mentionedAsset?: AssetContextData;
  coverage: DataCoverage[];
};

const STALE_LOOKBACK_MESSAGE = "The last successful sync is more than 2 hours old, so this may not reflect very recent changes.";

function paperCoverage(): DataCoverage {
  // Paper Trading has no external sync dependency at all — it's Compass's
  // own simulated ledger, always current the instant it's read.
  return { provider: "paper", status: "AVAILABLE", lastSyncedAt: null, message: null };
}

function syncBackedCoverage(params: {
  provider: string;
  connected: boolean;
  syncStatus: "NEVER_SYNCED" | "SYNCING" | "SYNCED" | "FAILED" | null;
  lastSyncAt: string | null;
  lastFailedSyncAt: string | null;
  displayName: string;
}): DataCoverage {
  const { provider, connected, syncStatus, lastSyncAt, displayName } = params;
  if (!connected) {
    return { provider, status: "UNAVAILABLE", lastSyncedAt: null, message: `${displayName} is not connected.` };
  }
  if (syncStatus === "NEVER_SYNCED" || (!lastSyncAt && syncStatus !== "SYNCED")) {
    return { provider, status: "UNAVAILABLE", lastSyncedAt: null, message: `${displayName} is connected but hasn't been synced yet.` };
  }
  if (syncStatus === "FAILED") {
    return lastSyncAt
      ? { provider, status: "PARTIAL", lastSyncedAt: lastSyncAt, message: `The last ${displayName} sync attempt failed — showing data from the last successful sync.` }
      : { provider, status: "ERROR", lastSyncedAt: null, message: `${displayName} sync has never completed successfully.` };
  }
  if (lastSyncAt && classifyTrading212Staleness(lastSyncAt) !== "fresh") {
    const veryStale = classifyTrading212Staleness(lastSyncAt) === "very_stale";
    return {
      provider,
      status: "STALE",
      lastSyncedAt: lastSyncAt,
      message: veryStale ? STALE_LOOKBACK_MESSAGE : `Synced a little while ago — recent changes may not be reflected yet.`,
    };
  }
  return { provider, status: "AVAILABLE", lastSyncedAt: lastSyncAt, message: null };
}

async function buildPaperSnapshot(userId: string): Promise<PortfolioSnapshot> {
  try {
    const account = await getAccountView(userId);
    return {
      source: "PAPER",
      coverage: paperCoverage(),
      totalValue: account.portfolioValue,
      currency: "USD",
      unrealizedPnl: account.unrealizedPnl,
      positions: account.positions.map((p) => ({
        source: "PAPER",
        symbol: p.symbol,
        name: p.name,
        compassAssetId: p.assetId,
        quantity: p.quantity,
        value: p.marketValue,
        currency: "USD",
        unrealizedPnl: p.unrealizedPnl,
      })),
    };
  } catch {
    return { source: "PAPER", coverage: { provider: "paper", status: "ERROR", lastSyncedAt: null, message: "Paper account data couldn't be read right now." }, totalValue: null, currency: null, unrealizedPnl: null, positions: [] };
  }
}

async function buildTrading212Snapshot(userId: string): Promise<PortfolioSnapshot> {
  const connection = await getTrading212Connection(userId);
  const coverage = syncBackedCoverage({
    provider: "trading212",
    connected: connection !== null,
    syncStatus: connection?.syncStatus ?? null,
    lastSyncAt: connection?.lastSyncAt ?? null,
    lastFailedSyncAt: connection?.lastFailedSyncAt ?? null,
    displayName: "Trading 212",
  });
  if (!connection || coverage.status === "UNAVAILABLE") {
    return { source: "TRADING212", coverage, totalValue: null, currency: null, unrealizedPnl: null, positions: [] };
  }
  const portfolio = await getTrading212Portfolio(userId);
  if (!portfolio) {
    return { source: "TRADING212", coverage, totalValue: null, currency: null, unrealizedPnl: null, positions: [] };
  }
  return {
    source: "TRADING212",
    coverage,
    totalValue: portfolio.account?.totalValue ?? null,
    currency: portfolio.account?.currencyCode ?? null,
    unrealizedPnl: portfolio.account?.unrealizedPnl ?? null,
    positions: portfolio.positions.map((p) => ({
      source: "TRADING212",
      symbol: p.externalTicker,
      name: p.externalName,
      compassAssetId: p.compassAssetId,
      quantity: p.quantity,
      value: p.currentPrice != null ? p.currentPrice * p.quantity : null,
      currency: p.currencyCode,
      unrealizedPnl: p.unrealizedPnl,
    })),
  };
}

async function buildInteractiveBrokersSnapshot(userId: string): Promise<PortfolioSnapshot> {
  const connection = await getInteractiveBrokersConnection(userId);
  const coverage = syncBackedCoverage({
    provider: "interactive_brokers",
    connected: connection !== null,
    syncStatus: null, // IBKR's own connection DTO carries no syncStatus (Phase 1) — its portfolio DTO does, checked below
    lastSyncAt: null,
    lastFailedSyncAt: null,
    displayName: "Interactive Brokers",
  });
  if (!connection) {
    return { source: "IBKR", coverage, totalValue: null, currency: null, unrealizedPnl: null, positions: [] };
  }
  const portfolio = await getInteractiveBrokersPortfolio(userId);
  if (!portfolio) {
    return {
      source: "IBKR",
      coverage: { provider: "interactive_brokers", status: "UNAVAILABLE", lastSyncedAt: null, message: "Interactive Brokers is connected but hasn't been synced yet." },
      totalValue: null,
      currency: null,
      unrealizedPnl: null,
      positions: [],
    };
  }
  const realCoverage = syncBackedCoverage({
    provider: "interactive_brokers",
    connected: true,
    syncStatus: portfolio.syncStatus,
    lastSyncAt: portfolio.lastSyncAt,
    lastFailedSyncAt: portfolio.lastFailedSyncAt,
    displayName: "Interactive Brokers",
  });
  return {
    source: "IBKR",
    coverage: realCoverage,
    totalValue: portfolio.account?.totalValue ?? null,
    currency: portfolio.account?.currencyCode ?? null,
    unrealizedPnl: portfolio.account?.unrealizedPnl ?? null,
    positions: portfolio.positions.map((p) => ({
      source: "IBKR",
      symbol: p.externalTicker,
      name: p.externalName,
      compassAssetId: p.compassAssetId,
      quantity: p.quantity,
      value: p.currentPrice != null ? p.currentPrice * p.quantity : null,
      currency: p.currencyCode,
      unrealizedPnl: p.unrealizedPnl,
    })),
  };
}

async function buildHyperliquidSnapshot(userId: string): Promise<PortfolioSnapshot> {
  const wallet = await getPrimaryWallet(userId);
  if (!wallet) {
    return {
      source: "HYPERLIQUID",
      coverage: { provider: "hyperliquid", status: "UNAVAILABLE", lastSyncedAt: null, message: "No wallet is connected." },
      totalValue: null,
      currency: null,
      unrealizedPnl: null,
      positions: [],
    };
  }
  const result = await getHyperliquidAccount(wallet.address);
  if (result.status !== "ok") {
    return {
      source: "HYPERLIQUID",
      coverage: { provider: "hyperliquid", status: "ERROR", lastSyncedAt: null, message: `Hyperliquid data couldn't be read right now (${result.reason}).` },
      totalValue: null,
      currency: null,
      unrealizedPnl: null,
      positions: [],
    };
  }
  const totalUnrealizedPnl = result.account.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  return {
    source: "HYPERLIQUID",
    coverage: { provider: "hyperliquid", status: "AVAILABLE", lastSyncedAt: new Date(result.account.timestamp).toISOString(), message: null },
    totalValue: result.account.accountValue,
    currency: "USD",
    unrealizedPnl: totalUnrealizedPnl,
    positions: result.account.positions.map((p) => ({
      source: "HYPERLIQUID",
      symbol: p.coin,
      name: null,
      compassAssetId: getAssetIdForHyperliquidCoin(p.coin),
      quantity: p.size,
      value: p.positionValue,
      currency: "USD",
      unrealizedPnl: p.unrealizedPnl,
    })),
  };
}

async function buildPortfolioSnapshot(userId: string, source: PortfolioContextSource): Promise<PortfolioSnapshot> {
  switch (source) {
    case "PAPER":
      return buildPaperSnapshot(userId);
    case "TRADING212":
      return buildTrading212Snapshot(userId);
    case "IBKR":
      return buildInteractiveBrokersSnapshot(userId);
    case "HYPERLIQUID":
      return buildHyperliquidSnapshot(userId);
    case "ALL":
      // Handled by the caller (fetches all four in parallel) — never
      // reachable here directly.
      throw new Error("buildPortfolioSnapshot called with source=ALL");
  }
}

async function buildAllPortfolioSnapshots(userId: string): Promise<PortfolioSnapshot[]> {
  return Promise.all([
    buildPaperSnapshot(userId),
    buildTrading212Snapshot(userId),
    buildInteractiveBrokersSnapshot(userId),
    buildHyperliquidSnapshot(userId),
  ]);
}

/** Cross-source exposure for one Compass asset id — every portfolio
 * source's own position for that asset, each keeping its own `source`
 * tag (never summed — Section 8). */
function exposureForAsset(snapshots: PortfolioSnapshot[], assetId: string): FinancialPosition[] {
  return snapshots.flatMap((s) => s.positions.filter((p) => p.compassAssetId === assetId));
}

async function buildAssetContext(assetId: string, allSnapshots: PortfolioSnapshot[]): Promise<AssetContextData | null> {
  const asset = getAsset(assetId);
  if (!asset) return null;

  const [quoteResults, newsItems] = await Promise.all([getQuotes([assetId]), getNewsProvider().getLatestNews().catch(() => [] as NewsItem[])]);
  const quoteResult = quoteResults[0];
  const quote = quoteResult?.status === "ok" ? { price: quoteResult.quote.price, change: quoteResult.quote.change, changePercent: quoteResult.quote.changePercent } : null;

  const relatedNews = filterNewsBySlug(newsItems, assetId)
    .slice(0, 3)
    .map((n) => ({ title: n.title, source: n.source, url: n.url, publishedAt: n.publishedAt }));

  return {
    assetId: asset.id,
    name: asset.name,
    symbol: asset.symbol,
    category: asset.category,
    quote,
    exposure: exposureForAsset(allSnapshots, assetId),
    relatedNews,
  };
}

/** Catalog names carry legal suffixes ("NVIDIA Corp.", "Amazon.com Inc.")
 * and parentheticals ("Alphabet Inc. (Google)") a user would never
 * actually type. Reduces a display name to the plain, colloquial forms a
 * real message would use — "NVIDIA", "Amazon", "Google" — never adding a
 * generic/short token (< 3 chars) that could false-positive on ordinary
 * words. */
function nameAliases(name: string): string[] {
  const parenMatch = name.match(/\(([^)]+)\)/);
  const base = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const firstWord = base.split(/[\s.]+/)[0] ?? "";
  const aliases = [base, firstWord, ...(parenMatch ? [parenMatch[1]] : [])];
  return Array.from(new Set(aliases.filter((a) => a.length >= 3)));
}

/** A lightweight, deterministic (never full-NLU) detector for "the user's
 * follow-up message mentions a different catalog asset than the current
 * context" (Section 7's own worked example: user in PORTFOLIO context
 * asks "What about NVIDIA?"). Matches a catalog asset's exact symbol or
 * a colloquial form of its name as a whole word, case-insensitive — never
 * a partial/fuzzy match that could misfire on an unrelated word. */
export function detectMentionedAssetId(message: string, excludeAssetId?: string): string | null {
  for (const asset of ALL_ASSETS as AssetCatalogEntry[]) {
    if (asset.id === excludeAssetId) continue;
    const candidates = [asset.symbol, ...nameAliases(asset.name)];
    const matched = candidates.some((candidate) => new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "i").test(message));
    if (matched) return asset.id;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type BuildFinancialContextParams = {
  userId: string;
  context: CompassContext;
  message: string;
  locale: Locale;
  /** Only used for LEARNING context, mirroring buildLearningContext's own
   * required inputs — Compass never invents a difficulty/level, it's
   * passed through from the same client state the AI Tutor already uses. */
  learningDifficulty?: DifficultyLevel;
};

/** The single entry point the Compass engine calls. Fetches ONLY what the
 * given context (plus, for a mentioned-asset follow-up, one extra asset)
 * actually needs — never every source's full position list for an ASSET
 * or NEWS question, never a full news batch scan for a pure PORTFOLIO
 * question beyond what's already cached by getNewsProvider() itself. */
export async function buildFinancialContext(params: BuildFinancialContextParams): Promise<FinancialContext> {
  const { userId, context, message, locale } = params;

  let portfolios: PortfolioSnapshot[] = [];
  let asset: AssetContextData | undefined;
  let news: NewsContextData | undefined;
  let learning: LearningContext | undefined;

  if (context.type === "HOME" || context.type === "PROFILE") {
    portfolios = await buildAllPortfolioSnapshots(userId);
  } else if (context.type === "PORTFOLIO") {
    portfolios = context.source === "ALL" ? await buildAllPortfolioSnapshots(userId) : [await buildPortfolioSnapshot(userId, context.source)];
  } else if (context.type === "ASSET") {
    portfolios = await buildAllPortfolioSnapshots(userId);
    asset = (await buildAssetContext(context.assetId, portfolios)) ?? undefined;
  } else if (context.type === "NEWS") {
    portfolios = await buildAllPortfolioSnapshots(userId);
    // With no specific articleId, the user is browsing the news feed
    // generally (e.g. asking how inflation news relates to their
    // portfolio, not about one headline) — there's no single article to
    // summarize, so `news` stays unset and the model answers from the
    // portfolio data plus its own general market knowledge, same as it
    // would for a HOME-context market question.
    if (context.articleId) {
      const items = await getNewsProvider()
        .getLatestNews()
        .catch(() => [] as NewsItem[]);
      const article = findNewsById(items, context.articleId) ?? null;
      const relatedAssetIds = article ? (ALL_ASSETS as AssetCatalogEntry[]).filter((a) => article.symbols.some((s) => s.toUpperCase() === a.symbol.toUpperCase())).map((a) => a.id) : [];
      const exposure = relatedAssetIds.flatMap((id) => exposureForAsset(portfolios, id));
      news = {
        article: article ? { title: article.title, description: article.description, source: article.source, url: article.url, publishedAt: article.publishedAt, symbols: article.symbols } : null,
        relatedAssetIds,
        exposure,
      };
    }
  } else if (context.type === "LEARNING") {
    learning =
      buildLearningContext({
        assetId: context.assetId,
        lessonId: context.lessonId ?? "",
        difficulty: params.learningDifficulty ?? "beginner",
        locale,
      }) ?? undefined;
    portfolios = await buildAllPortfolioSnapshots(userId);
  } else {
    // Connection contexts (TRADING212_CONNECTION / IBKR_CONNECTION /
    // HYPERLIQUID_CONNECTION) — informational only; still surface that
    // ONE connection's own real coverage so Compass can answer "is it
    // synced?" honestly instead of guessing.
    if (context.type === "TRADING212_CONNECTION") portfolios = [await buildTrading212Snapshot(userId)];
    else if (context.type === "IBKR_CONNECTION") portfolios = [await buildInteractiveBrokersSnapshot(userId)];
    else if (context.type === "HYPERLIQUID_CONNECTION") portfolios = [await buildHyperliquidSnapshot(userId)];
  }

  const currentAssetId = context.type === "ASSET" ? context.assetId : (context.type === "LEARNING" ? context.assetId : undefined);
  const mentionedAssetId = detectMentionedAssetId(message, currentAssetId);
  const mentionedAsset = mentionedAssetId ? ((await buildAssetContext(mentionedAssetId, portfolios)) ?? undefined) : undefined;

  const coverage = portfolios.map((p) => p.coverage);

  return {
    portfolios,
    ...(asset ? { asset } : {}),
    ...(news ? { news } : {}),
    ...(learning ? { learning } : {}),
    ...(mentionedAsset ? { mentionedAsset } : {}),
    coverage,
  };
}
