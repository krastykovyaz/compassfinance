import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUserSignedAction = vi.fn();
vi.mock("@nktkas/hyperliquid/signing", () => ({
  signUserSignedAction: (...args: unknown[]) => signUserSignedAction(...args),
  // hyperliquid-order-signer.ts (imported for real below, for
  // createHyperliquidWalletAdapter/nextNonce/signingErrorDetail) also
  // imports signL1Action from this module — stubbed, never exercised by
  // these tests (only signAndSubmitPerpOrder calls it).
  signL1Action: vi.fn(),
}));

const getChainId = vi.fn();
const isUserRejectedError = vi.fn((err: unknown) => !!err && typeof err === "object" && (err as { code?: number }).code === 4001);
vi.mock("@/lib/wallet/evm-wallet-provider", () => ({
  getChainId: (...args: unknown[]) => getChainId(...args),
  isUserRejectedError: (...args: [unknown]) => isUserRejectedError(...args),
  signTypedData: vi.fn(async () => "0xsig"),
}));

import {
  generateAgentKeypair,
  createAgentSigner,
  buildApproveAgentAction,
  approveAgent,
} from "./hyperliquid-agent-wallet";
import type { Eip1193Provider } from "@/lib/wallet/wallet-types";

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

function mockProvider(): Eip1193Provider {
  return { request: vi.fn(async () => "0xsig"), on: vi.fn(), removeListener: vi.fn() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateAgentKeypair — a fresh, ephemeral keypair, never the user's own wallet key", () => {
  it("returns a well-formed private key and address", () => {
    const { privateKey, address } = generateAgentKeypair();
    expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("generates a genuinely different keypair every time — not a fixed/reused value", () => {
    const a = generateAgentKeypair();
    const b = generateAgentKeypair();
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.address).not.toBe(b.address);
  });
});

describe("createAgentSigner", () => {
  it("returns a local signer whose address matches the keypair it was built from", () => {
    const { privateKey, address } = generateAgentKeypair();
    const signer = createAgentSigner(privateKey);
    expect(signer.address.toLowerCase()).toBe(address.toLowerCase());
    expect(typeof signer.signTypedData).toBe("function");
  });
});

describe("buildApproveAgentAction — pure builder", () => {
  it("builds the exact Hyperliquid approveAgent action shape", () => {
    const action = buildApproveAgentAction({
      agentAddress: "0xagent",
      agentName: "CompassFinance",
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      nonce: 12345,
    });
    expect(action).toEqual({
      type: "approveAgent",
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      agentAddress: "0xagent",
      agentName: "CompassFinance",
      nonce: 12345,
    });
  });

  // The entire point of Phase 5: signL1Action (used for real trades) is
  // stuck signing with a FIXED chainId 1337, which some wallets reject as
  // a mismatch against their real active network. approveAgent's
  // signatureChainId must be whatever the wallet's real chain actually is
  // — never a fixed value — or this fix doesn't fix anything.
  it("never hardcodes signatureChainId — it's exactly whatever real chain is passed in, testnet or mainnet alike", () => {
    const onArbitrum = buildApproveAgentAction({
      agentAddress: "0xagent",
      agentName: "a",
      signatureChainId: "0xa4b1", // 42161, Arbitrum One — a real wallet's real active chain
      hyperliquidChain: "Mainnet",
      nonce: 1,
    });
    const onSepolia = buildApproveAgentAction({
      agentAddress: "0xagent",
      agentName: "a",
      signatureChainId: "0xaa36a7", // Ethereum Sepolia — a different real chain
      hyperliquidChain: "Testnet",
      nonce: 1,
    });
    expect(onArbitrum.signatureChainId).toBe("0xa4b1");
    expect(onSepolia.signatureChainId).toBe("0xaa36a7");
    expect(onArbitrum.signatureChainId).not.toBe("0x539"); // never the fixed L1-action value (1337)
  });
});

describe("approveAgent — orchestration", () => {
  const SIGNATURE = { r: "0xaaa", s: "0xbbb", v: 27 };

  beforeEach(() => {
    signUserSignedAction.mockReset();
    getChainId.mockReset();
    getChainId.mockResolvedValue(42161); // Arbitrum One — a real wallet chain, not 1337
  });

  it("signs with the wallet's REAL current chain, not a fixed value — the actual fix, verified end to end", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));

    await approveAgent({ provider: mockProvider(), address: "0xuser", agentAddress: "0xagent", isTestnet: false });

    const signedAction = signUserSignedAction.mock.calls[0][0].action;
    expect(signedAction.signatureChainId).toBe("0xa4b1"); // 42161 in hex — from getChainId(), not hardcoded
  });

  it("submits through the existing /api/hyperliquid/order route, not directly to Hyperliquid", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } }));
    vi.stubGlobal("fetch", fetchMock);

    await approveAgent({ provider: mockProvider(), address: "0xuser", agentAddress: "0xagent", isTestnet: false });

    expect(fetchMock).toHaveBeenCalledWith("/api/hyperliquid/order", expect.objectContaining({ method: "POST" }));
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.address).toBe("0xuser");
    expect(body.action.type).toBe("approveAgent");
    expect(body.action.agentAddress).toBe("0xagent");
  });

  it("classifies a wallet rejection distinctly, without ever calling fetch", async () => {
    signUserSignedAction.mockRejectedValue({ code: 4001, message: "User rejected" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await approveAgent({
      provider: mockProvider(),
      address: "0xuser",
      agentAddress: "0xagent",
      isTestnet: false,
    });

    expect(result).toEqual({ status: "wallet-rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the real underlying error message on a non-rejection signing failure — never a dead-end generic message", async () => {
    signUserSignedAction.mockRejectedValue(
      new Error("Failed to sign the typed data using the wallet", {
        cause: { message: "Active chainId is 0xa4b1 but received 0x539" },
      })
    );
    vi.stubGlobal("fetch", vi.fn());

    const result = await approveAgent({
      provider: mockProvider(),
      address: "0xuser",
      agentAddress: "0xagent",
      isTestnet: false,
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "invalid-request",
      message: "Couldn't sign the trading approval: Active chainId is 0xa4b1 but received 0x539",
    });
  });

  it("passes isTestnet through as hyperliquidChain: Testnet", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));

    await approveAgent({ provider: mockProvider(), address: "0xuser", agentAddress: "0xagent", isTestnet: true });

    expect(signUserSignedAction.mock.calls[0][0].action.hyperliquidChain).toBe("Testnet");
  });

  it("classifies a network failure reaching our own route as network-failure, never a hard error", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection reset")));

    const result = await approveAgent({
      provider: mockProvider(),
      address: "0xuser",
      agentAddress: "0xagent",
      isTestnet: false,
    });

    expect(result.status).toBe("network-failure");
  });
});
