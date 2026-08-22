import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Structural guardrail: this integration must never request, read, store,
// or transmit a private key, seed phrase, or a raw transaction-signing
// capability. Every EIP-1193 call the wallet layer makes is read/
// permission-only (eth_requestAccounts, eth_accounts, eth_chainId,
// eth_call) or the ONE deliberate exception — eth_signTypedData_v4,
// added for Phase 4 real order execution. That method never exposes a
// private key either: the wallet performs the actual signing internally
// after the user reviews the exact message in their own wallet's UI; this
// app only ever supplies the message, never a key. This test fails the
// moment anyone adds a DIFFERENT signing method (eth_sign/personal_sign/
// eth_signTransaction — which DOES sign a raw transaction, unlike typed
// data) or a private-key/seed-phrase reference to any of these files,
// regardless of what they'd do with it.

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
    "src/lib/hyperliquid/hyperliquid-order-signer.ts",
    "src/app/hyperliquid/[coin]/page.tsx",
    "src/app/api/hyperliquid/order/route.ts",
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
    const allowedMethods = [
      "eth_requestAccounts",
      "eth_accounts",
      "eth_chainId",
      "eth_call",
      "eth_signTypedData_v4",
    ];
    const methodCalls = [...src.matchAll(/method:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(methodCalls.length).toBeGreaterThan(0); // sanity: the test actually found calls to check
    for (const method of methodCalls) {
      expect(allowedMethods).toContain(method);
    }
  });
});
