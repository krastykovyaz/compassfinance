import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Structural guardrail for Compass Agent's read-only guarantee (Phase 4,
// Section 4/45: "Never call trading endpoints from Compass Agent. Never
// call /iserver endpoints for IBKR."). Compass calls only read-side
// repository/service functions (getTrading212Portfolio,
// getInteractiveBrokersPortfolio, getHyperliquidAccount, getQuotes, ...)
// — it must never reference /iserver directly, nor any of the known
// order-submission/signing entry points the rest of the app uses for
// real trading. This test fails the moment any file under the Compass
// Agent surface references one of those, regardless of context.

const SCAN_DIRS = ["src/server/compass", "src/lib/compass", "src/app/api/compass", "src/components/compass"];

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\/iserver/,
  /submitHyperliquidExchangeAction/,
  /signAndSubmitPerpOrder/,
  /\bplaceTrade\b/,
  /postExchange/,
  /\/exchange"/, // Hyperliquid's own order-submission endpoint path literal
];

function allTsFilesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return allTsFilesIn(path);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("Compass Agent never references trading/order-submission or IBKR /iserver endpoints (read-only guarantee)", () => {
  const files = SCAN_DIRS.flatMap(allTsFilesIn).filter((f) => !f.endsWith(".test.ts"));

  it("scanned at least the expected number of files (sanity check the scan itself isn't silently empty)", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files)("%s contains no trading/order-submission or /iserver reference", (file) => {
    const source = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });
});
