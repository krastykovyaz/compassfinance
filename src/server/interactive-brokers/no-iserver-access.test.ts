import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Structural guardrail for the Interactive Brokers integration's read-only
// guarantee. Per docs/integrations/interactive-brokers-phase-0.md §13:
// the IBKR OAuth access token is NOT protocol-level read-only — the same
// token that reads /portfolio/* could, in principle, be used against
// /iserver trading endpoints. CompassFinance's read-only guarantee is
// therefore an architectural discipline, not something IBKR enforces:
// this integration must simply never call /iserver/auth/ssodh/init (the
// brokerage-session init call every /iserver trading/order/market-data
// endpoint requires) or any other /iserver path. This test fails the
// moment any file in this directory (or the API routes built on it)
// references "/iserver" at all, regardless of context.

const SCAN_DIRS = ["src/server/interactive-brokers"];
const SCAN_FILES = [
  "src/app/api/user/interactive-brokers/route.ts",
  "src/app/api/user/interactive-brokers/oauth/start/route.ts",
  "src/app/api/user/interactive-brokers/oauth/callback/route.ts",
  "src/app/api/user/interactive-brokers/portfolio/route.ts",
  "src/app/api/user/interactive-brokers/sync/route.ts",
  "src/app/api/user/interactive-brokers/select-account/route.ts",
  "src/app/api/user/interactive-brokers/activity/route.ts",
  "src/server/repositories/interactive-brokers-repository.ts",
  "src/server/repositories/interactive-brokers-portfolio-repository.ts",
  "src/server/repositories/interactive-brokers-activity-repository.ts",
];

function allTsFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

describe("Interactive Brokers integration never references /iserver (the read-only architectural guarantee)", () => {
  const files = [...SCAN_DIRS.flatMap(allTsFilesIn), ...SCAN_FILES];

  it("scanned at least the expected number of files (sanity check the scan itself isn't silently empty)", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files)("%s contains no /iserver reference", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/\/iserver/);
  });
});
