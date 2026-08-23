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
  const files = [
    "src/lib/hyperliquid/perp-order-calculator.ts",
    "src/lib/hyperliquid/hyperliquid-order-signer.ts",
    "src/lib/hyperliquid/hyperliquid-agent-wallet.ts",
    "src/lib/hyperliquid/hyperliquid-agent-provider.tsx",
    "src/app/hyperliquid/[coin]/page.tsx",
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
