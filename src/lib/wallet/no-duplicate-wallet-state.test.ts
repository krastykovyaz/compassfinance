import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Structural guardrail: WalletConnect must be a second TRANSPORT feeding
// the one existing wallet state machine, never a second wallet state.
// wallet-provider.tsx is the only file allowed to own React state for the
// wallet — walletconnect-provider.ts, walletconnect-deep-links.ts, and the
// connect modal must stay pure functions / local UI state (QR string,
// modal open/closed) with zero createContext of their own.

const WALLET_DIR = "src/lib/wallet";

function allTsFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .map((f) => join(dir, f));
}

describe("Exactly one wallet Context exists across the wallet layer", () => {
  it("createContext( appears exactly once, in wallet-provider.tsx", () => {
    const files = allTsFilesIn(WALLET_DIR);
    let occurrences = 0;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const matches = src.match(/createContext[<(]/g);
      if (matches) {
        occurrences += matches.length;
        expect(file).toBe("src/lib/wallet/wallet-provider.tsx");
      }
    }
    expect(occurrences).toBe(1);
  });

  it("walletconnect-provider.ts and walletconnect-deep-links.ts hold no React state (no useState/useContext/createContext)", () => {
    const files = ["src/lib/wallet/walletconnect-provider.ts", "src/lib/wallet/walletconnect-deep-links.ts"];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/useState\(/);
      expect(src).not.toMatch(/useContext\(/);
      expect(src).not.toMatch(/createContext\(/);
    }
  });

  it("wallet-types.ts holds no React state itself — types only", () => {
    const src = readFileSync("src/lib/wallet/wallet-types.ts", "utf8");
    expect(src).not.toMatch(/useState\(/);
    expect(src).not.toMatch(/createContext\(/);
  });
});
