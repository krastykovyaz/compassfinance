import { readFileSync } from "fs";
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

// Phase 3 (order preview) guardrail: stays isolated from Paper
// Trading/unlock like every prior phase, AND never references anything
// that would submit a real order — no signing, no Hyperliquid "exchange"
// (write) endpoint, no order-writing action name.
describe("Hyperliquid Trading Phase 3 (order preview) stays isolated and never submits a real order", () => {
  const files = [
    "src/lib/hyperliquid/perp-order-calculator.ts",
    "src/app/hyperliquid/[coin]/page.tsx",
    "src/components/hyperliquid/perp-order-preview-sheet.tsx",
  ];

  it("imports nothing paper/unlock-related", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/paper/i);
      expect(src).not.toMatch(/\bunlock/i);
    }
  });

  it("never references a Hyperliquid order-writing action or endpoint", () => {
    const DANGEROUS = [/\/exchange\b/i, /"order"/i, /updateLeverage/i, /cancelOrder/i, /placeOrder/i, /submitOrder/i];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const pattern of DANGEROUS) {
        expect(src).not.toMatch(pattern);
      }
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
