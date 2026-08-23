import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Structural guardrail: this integration must never request, read, store,
// or transmit THE USER'S OWN private key, seed phrase, or a raw
// transaction-signing capability. Every EIP-1193 call the wallet layer
// makes is read/permission-only (eth_requestAccounts, eth_accounts,
// eth_chainId, eth_call) or the ONE deliberate exception —
// eth_signTypedData_v4, added for Phase 4 real order execution. That
// method never exposes a private key either: the wallet performs the
// actual signing internally after the user reviews the exact message in
// their own wallet's UI; this app only ever supplies the message, never a
// key. This test fails the moment anyone adds a DIFFERENT signing method
// (eth_sign/personal_sign/eth_signTransaction — which DOES sign a raw
// transaction, unlike typed data) or a private-key/seed-phrase reference
// to any of these files, regardless of what they'd do with it.
//
// Phase 5 exception, deliberate and narrow: hyperliquid-agent-wallet.ts
// DOES generate a private key — but it is a fresh, purpose-built,
// CompassFinance-generated "agent" keypair, never the user's own wallet
// key or anything derived from it. It only ever holds delegated
// Hyperliquid trading authority (no funds of its own to steal even if
// leaked), is generated in memory, never sent to CompassFinance's server
// (only its public address is), and never persisted to disk/localStorage/
// sessionStorage — see hyperliquid-agent-provider.tsx, which holds it in
// React state only, gone on reload. That file is intentionally excluded
// from both scans below rather than silently passing/failing on it.

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

describe("Phase 5 Agent Wallet — the one deliberate, narrow private-key exception", () => {
  const AGENT_FILES = [
    "src/lib/hyperliquid/hyperliquid-agent-wallet.ts",
    "src/lib/hyperliquid/hyperliquid-agent-provider.tsx",
  ];

  it("still never references a raw-transaction-signing RPC method, even here", () => {
    for (const file of AGENT_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/eth_sign\b/);
      expect(src).not.toMatch(/personal_sign/i);
      expect(src).not.toMatch(/eth_signTransaction/i);
    }
  });

  it("generates the agent key only via viem's own established helpers — never hand-rolled crypto", () => {
    const src = readFileSync("src/lib/hyperliquid/hyperliquid-agent-wallet.ts", "utf8");
    expect(src).toMatch(/from "viem\/accounts"/);
    expect(src).toMatch(/generatePrivateKey/);
    expect(src).toMatch(/privateKeyToAccount/);
  });

  it("never sends the agent's private key to CompassFinance's own server — the /api/hyperliquid/order submission body only ever carries the public address, action, nonce, and signature", () => {
    const src = readFileSync("src/lib/hyperliquid/hyperliquid-agent-wallet.ts", "utf8");
    const fetchBodies = [...src.matchAll(/body:\s*JSON\.stringify\(([^)]*)\)/g)].map((m) => m[1]);
    expect(fetchBodies.length).toBeGreaterThan(0); // sanity: found the real submission call
    for (const body of fetchBodies) {
      expect(body).not.toMatch(/privateKey/i);
    }
  });

  it("never persists the agent key to localStorage/sessionStorage/IndexedDB/cookies — React state only, gone on reload", () => {
    // Actual API usage (dot access), not the bare word — both files'
    // own explanatory comments legitimately mention these APIs BY NAME
    // to say they're deliberately not used, which a bare-word match
    // would wrongly flag.
    for (const file of AGENT_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/localStorage\s*\./);
      expect(src).not.toMatch(/sessionStorage\s*\./);
      expect(src).not.toMatch(/indexedDB\s*\./i);
      expect(src).not.toMatch(/document\.cookie/);
    }
  });
});
