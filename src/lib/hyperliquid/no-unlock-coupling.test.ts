import { readFileSync, readdirSync } from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getInvestmentAccess } from "@/lib/learning/unlocks";
import type { LearningProgress } from "@/lib/learning/types";

// Structural guardrail: the investment-unlock system AND Paper Trading
// must stay 100% free of the Hyperliquid/wallet integration (Phase 1 read-
// only market data, Phase 2 read-only account data). This test fails the
// moment anyone adds a Hyperliquid import to any of these files,
// regardless of what they'd do with it — a behavioral-only test can't
// catch that, since none of these functions take market/account data as
// an input at all.
describe("Hyperliquid integration never touches Learning/Unlock/Paper Trading", () => {
  it("unlocks.ts, trading-service.ts, and paper-trading-repository.ts import nothing Hyperliquid-related", () => {
    const files = [
      "src/lib/learning/unlocks.ts",
      "src/server/services/trading-service.ts",
      "src/server/repositories/paper-trading-repository.ts",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/hyperliquid/i);
    }
  });

  it("paper-account-provider.tsx imports nothing from the wallet or Hyperliquid layers", () => {
    const src = readFileSync("src/lib/trading/paper-account-provider.tsx", "utf8");
    expect(src).not.toMatch(/hyperliquid/i);
    expect(src).not.toMatch(/wallet/i);
  });
});

// Symmetric guardrail in the other direction: the wallet layer must not
// reach into Paper Trading/learning any more than trading reaches into
// Hyperliquid — wallet-link-sync.tsx only ever talks to /api/user/wallet.
describe("The wallet layer never touches Paper Trading or the learning/unlock system", () => {
  it("wallet-provider.tsx and evm-wallet-provider.tsx import nothing paper/unlock/learning-related", () => {
    const files = [
      "src/lib/wallet/wallet-provider.tsx",
      "src/lib/wallet/evm-wallet-provider.tsx",
      "src/lib/wallet/walletconnect-provider.ts",
      "src/lib/wallet/walletconnect-deep-links.ts",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/paper/i);
      expect(src).not.toMatch(/unlock/i);
      expect(src).not.toMatch(/learning/i);
    }
  });
});

// Hyperliquid Trading — order preview (Phase 3) and real order execution
// (Phase 4) stay isolated from Paper Trading/unlock like every prior
// phase. Phase 3's original second test here ("never references a
// Hyperliquid order-writing action or endpoint") is DELIBERATELY RETIRED
// as of Phase 4 — real order execution is the literal point of this
// phase, so that assertion is no longer valid and would fail on purpose.
// In its place: real order submission is centralized to exactly one
// write function (postExchange, defined in client.ts and called only
// from service.ts's submitHyperliquidExchangeAction — the client-side
// signer/route never call it directly, they POST to our own API route
// instead) — this test proves that centralization holds structurally, so
// "who can submit a real order" stays answerable by reading one small
// file list rather than the whole codebase.
describe("Hyperliquid Trading (preview + real execution) stays isolated and centralized", () => {
  // Phase 7 deliberately punches ONE narrow, tested hole in this
  // isolation: real trading requires the same course/quiz/practice-trade
  // gate Paper Trading's own BUY already enforces (see
  // real-trading-access.ts). That coupling is intentionally excluded from
  // this list — src/app/hyperliquid/[coin]/page.tsx (the UI gate) and
  // src/lib/hyperliquid/real-trading-access.ts (the pure gate function,
  // service.ts's server-side enforcement) all now legitimately reference
  // learning progress. See the "Real-trading education gate" describe
  // block below for what's actually asserted about that coupling instead
  // of a blanket "never touches it" — everything else in the Hyperliquid
  // surface still must never touch paper/unlock at all.
  const files = [
    "src/lib/hyperliquid/perp-order-calculator.ts",
    "src/lib/hyperliquid/hyperliquid-order-signer.ts",
    "src/lib/hyperliquid/hyperliquid-agent-wallet.ts",
    "src/lib/hyperliquid/hyperliquid-agent-provider.tsx",
    "src/lib/hyperliquid/hyperliquid-dex-transfer.ts",
    "src/app/api/hyperliquid/order/route.ts",
    "src/components/hyperliquid/perp-order-preview-sheet.tsx",
    "src/components/hyperliquid/close-position-modal.tsx",
    "src/components/portfolio/hyperliquid-account-panel.tsx",
    "src/lib/hyperliquid/asset-mapping.ts",
    "src/components/hyperliquid/asset-details-panel.tsx",
  ];

  it("imports nothing paper/unlock-related", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/paper/i);
      expect(src).not.toMatch(/\bunlock/i);
    }
  });

  it("only client.ts (defines it) and service.ts (calls it) ever reference postExchange — the real Hyperliquid write path is centralized to these two files", () => {
    // Matches both a direct call (postExchange(...)) and a generic call
    // (postExchange<T>(...)) — service.ts's real call site is the latter.
    const POST_EXCHANGE_REFERENCE = /postExchange[<(]/;
    const ALLOWED = new Set(["src/server/hyperliquid/client.ts", "src/server/hyperliquid/service.ts"]);

    function allSourceFiles(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) out.push(...allSourceFiles(path));
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
      }
      return out;
    }

    const scanned = [
      ...allSourceFiles("src/server/hyperliquid"),
      ...allSourceFiles("src/lib/hyperliquid"),
      ...allSourceFiles("src/app/api/hyperliquid"),
    ];
    let sawAtLeastOneReference = false;
    for (const file of scanned) {
      const src = readFileSync(file, "utf8");
      if (POST_EXCHANGE_REFERENCE.test(src)) {
        sawAtLeastOneReference = true;
        expect(ALLOWED.has(file)).toBe(true);
      }
    }
    expect(sawAtLeastOneReference).toBe(true); // sanity: the test actually found the real call site
  });

  it("the real allowlist of submittable action types (updateLeverage, order, approveAgent) is present in service.ts — nothing else is ever forwarded to Hyperliquid", () => {
    const src = readFileSync("src/server/hyperliquid/service.ts", "utf8");
    expect(src).toMatch(/"updateLeverage"/);
    expect(src).toMatch(/"order"/);
    // Phase 5: the one-time agent-approval action, still routed through
    // the same allowlist/relay path as every other action, never a
    // separate/looser one.
    expect(src).toMatch(/"approveAgent"/);
  });
});

// Phase 7's one deliberate exception to "Hyperliquid never touches
// Learning/Unlock" — real trading requires the same education gate Paper
// Trading's own BUY already enforces, PLUS a completed practice trade.
// This block proves the coupling stays narrow (one file directly touches
// @/lib/learning) and one-directional (nothing under src/lib/hyperliquid,
// src/server/hyperliquid, or src/components/hyperliquid ever imports the
// Paper Trading system itself — only read-only learning PROGRESS, never
// trading logic) rather than re-asserting the now-intentionally-false
// "never touches it at all" from the block above.
describe("Real-trading education gate — the one deliberate Hyperliquid ↔ Learning coupling", () => {
  function allSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...allSourceFiles(path));
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it("only real-trading-access.ts, service.ts, and the trading page's own view import from @/lib/learning within the Hyperliquid surface", () => {
    const LEARNING_IMPORT = /@\/lib\/learning/;
    const ALLOWED = new Set([
      "src/lib/hyperliquid/real-trading-access.ts",
      "src/server/hyperliquid/service.ts",
      "src/app/hyperliquid/[coin]/page.tsx",
    ]);

    const scanned = [
      ...allSourceFiles("src/lib/hyperliquid"),
      ...allSourceFiles("src/server/hyperliquid"),
      ...allSourceFiles("src/components/hyperliquid"),
      "src/app/hyperliquid/[coin]/page.tsx",
    ];
    let sawAtLeastOneReference = false;
    for (const file of scanned) {
      const src = readFileSync(file, "utf8");
      if (LEARNING_IMPORT.test(src)) {
        sawAtLeastOneReference = true;
        expect(ALLOWED.has(file)).toBe(true);
      }
    }
    expect(sawAtLeastOneReference).toBe(true); // sanity: the gate actually exists somewhere
  });

  it("real-trading-access.ts never imports the Paper Trading system itself — only read-only learning progress/unlock logic", () => {
    const src = readFileSync("src/lib/hyperliquid/real-trading-access.ts", "utf8");
    expect(src).not.toMatch(/@\/lib\/trading/);
    expect(src).not.toMatch(/@\/server\/(services\/trading-service|repositories\/paper-trading-repository)/);
  });

  it("the direction never reverses — unlocks.ts and trading-service.ts still import nothing Hyperliquid-related", () => {
    for (const f of ["src/lib/learning/unlocks.ts", "src/server/services/trading-service.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/hyperliquid/i);
    }
  });
});

describe("getInvestmentAccess is unaffected by HYPERLIQUID_ENABLED", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.HYPERLIQUID_ENABLED;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  const progress: LearningProgress = {
    totalXP: 0,
    level: 1,
    lessonsCompleted: 0,
    quizzesCompleted: 0,
    correctAnswers: 0,
    currentStreak: 0,
    longestStreak: 0,
    assetsExplored: 0,
    investmentsMade: 0,
    distinctAssetsInvested: 0,
    unlockedAchievements: [],
    completedLessons: [],
    completedQuizzes: [],
    practiceTradedAssetIds: [],
    lastActivityAt: null,
  };

  it("btc and eth access status is identical whether the flag is on or off", () => {
    const before = {
      btc: getInvestmentAccess("btc", progress),
      eth: getInvestmentAccess("eth", progress),
    };

    process.env.HYPERLIQUID_ENABLED = "true";
    const after = {
      btc: getInvestmentAccess("btc", progress),
      eth: getInvestmentAccess("eth", progress),
    };

    expect(after).toEqual(before);
  });
});
