import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Structural guardrail: this integration must never request, read, store,
// or transmit a private key, seed phrase, or a raw signing capability.
// Every EIP-1193 call the wallet layer makes is read/permission-only
// (eth_requestAccounts, eth_accounts, eth_chainId, eth_call) — none of
// them can move funds or produce a signature. This fails the moment
// anyone adds a signing method (eth_sign/personal_sign/
// eth_signTransaction) or a private-key/seed-phrase reference to any of
// these files, regardless of what they'd do with it.

const DANGEROUS_PATTERNS = [/privateKey/i, /seedPhrase/i, /mnemonic/i, /eth_sign\b/, /personal_sign/i, /eth_signTransaction/i];

const WALLET_DIR = "src/lib/wallet";

function allTsFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .map((f) => join(dir, f));
}

describe("No private key, seed phrase, or signing capability anywhere in the wallet layer", () => {
  const files = [
    ...allTsFilesIn(WALLET_DIR),
    "src/lib/hyperliquid/hyperliquid-account-provider.tsx",
    "src/lib/hyperliquid/perp-order-calculator.ts",
    "src/app/hyperliquid/[coin]/page.tsx",
    "src/components/hyperliquid/perp-order-preview-sheet.tsx",
    "src/app/api/user/wallet/route.ts",
    "src/server/repositories/wallet-repository.ts",
  ];

  it.each(files)("%s contains no dangerous key/signing reference", (file) => {
    const src = readFileSync(file, "utf8");
    for (const pattern of DANGEROUS_PATTERNS) {
      expect(src).not.toMatch(pattern);
    }
  });

  it("the EIP-1193 client only ever calls read/permission RPC methods", () => {
    const src = readFileSync("src/lib/wallet/evm-wallet-provider.tsx", "utf8");
    const allowedMethods = ["eth_requestAccounts", "eth_accounts", "eth_chainId", "eth_call"];
    const methodCalls = [...src.matchAll(/method:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(methodCalls.length).toBeGreaterThan(0); // sanity: the test actually found calls to check
    for (const method of methodCalls) {
      expect(allowedMethods).toContain(method);
    }
  });
});
