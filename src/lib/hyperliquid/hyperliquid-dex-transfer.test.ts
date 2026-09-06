import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUserSignedAction = vi.fn();
vi.mock("@nktkas/hyperliquid/signing", () => ({
  signUserSignedAction: (...args: unknown[]) => signUserSignedAction(...args),
  signL1Action: vi.fn(),
}));

const getChainId = vi.fn();
const isUserRejectedError = vi.fn((err: unknown) => !!err && typeof err === "object" && (err as { code?: number }).code === 4001);
vi.mock("@/lib/wallet/evm-wallet-provider", () => ({
  getChainId: (...args: unknown[]) => getChainId(...args),
  isUserRejectedError: (...args: [unknown]) => isUserRejectedError(...args),
  signTypedData: vi.fn(async () => "0xsig"),
}));

import { buildSendAssetAction, signAndSubmitDexTransfer } from "./hyperliquid-dex-transfer";
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

const USDC_TOKEN_ID = "USDC:0x6d1e7cde53ba9467b783cb7c530ce054";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildSendAssetAction — pure builder", () => {
  it("a 'fund' transfer moves from the main dex (\"\") into the named HIP-3 dex", () => {
    const action = buildSendAssetAction({
      address: "0xuser",
      direction: "fund",
      dex: "xyz",
      amountUsdc: "25",
      usdcTokenId: USDC_TOKEN_ID,
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      nonce: 1,
      isUnifiedAccount: false,
    });
    expect(action).toEqual({
      type: "sendAsset",
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      destination: "0xuser",
      sourceDex: "",
      destinationDex: "xyz",
      token: USDC_TOKEN_ID,
      amount: "25",
      fromSubAccount: "",
      nonce: 1,
    });
  });

  it("a 'fund' transfer uses \"spot\" (not \"\") as the main-dex side for a Unified Account — real, reproduced bug: Hyperliquid rejects \"\" for these accounts with 'Unified account only supports sending assets through spot'", () => {
    const action = buildSendAssetAction({
      address: "0xuser",
      direction: "fund",
      dex: "xyz",
      amountUsdc: "25",
      usdcTokenId: USDC_TOKEN_ID,
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      nonce: 1,
      isUnifiedAccount: true,
    });
    expect(action.sourceDex).toBe("spot");
    expect(action.destinationDex).toBe("xyz");
  });

  it("a 'withdraw' transfer uses \"spot\" (not \"\") as the destination for a Unified Account", () => {
    const action = buildSendAssetAction({
      address: "0xuser",
      direction: "withdraw",
      dex: "xyz",
      amountUsdc: "10",
      usdcTokenId: USDC_TOKEN_ID,
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      nonce: 2,
      isUnifiedAccount: true,
    });
    expect(action.sourceDex).toBe("xyz");
    expect(action.destinationDex).toBe("spot");
  });

  it("a 'withdraw' transfer moves from the named HIP-3 dex back to the main dex (\"\")", () => {
    const action = buildSendAssetAction({
      address: "0xuser",
      direction: "withdraw",
      dex: "xyz",
      amountUsdc: "10",
      usdcTokenId: USDC_TOKEN_ID,
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      nonce: 2,
      isUnifiedAccount: false,
    });
    expect(action.sourceDex).toBe("xyz");
    expect(action.destinationDex).toBe("");
  });

  it("destination is always the caller's own address — never anywhere else", () => {
    const action = buildSendAssetAction({
      address: "0xuser",
      direction: "fund",
      dex: "xyz",
      amountUsdc: "1",
      usdcTokenId: USDC_TOKEN_ID,
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      nonce: 1,
      isUnifiedAccount: false,
    });
    expect(action.destination).toBe("0xuser");
  });

  it("never hardcodes signatureChainId — whatever real chain is passed in, testnet or mainnet alike", () => {
    const onArbitrum = buildSendAssetAction({
      address: "0xuser",
      direction: "fund",
      dex: "xyz",
      amountUsdc: "1",
      usdcTokenId: USDC_TOKEN_ID,
      signatureChainId: "0xa4b1",
      hyperliquidChain: "Mainnet",
      nonce: 1,
      isUnifiedAccount: false,
    });
    const onSepolia = buildSendAssetAction({
      address: "0xuser",
      direction: "fund",
      dex: "xyz",
      amountUsdc: "1",
      usdcTokenId: USDC_TOKEN_ID,
      signatureChainId: "0xaa36a7",
      hyperliquidChain: "Testnet",
      nonce: 1,
      isUnifiedAccount: false,
    });
    expect(onArbitrum.signatureChainId).toBe("0xa4b1");
    expect(onSepolia.signatureChainId).toBe("0xaa36a7");
  });
});

describe("signAndSubmitDexTransfer — orchestration", () => {
  const SIGNATURE = { r: "0xaaa", s: "0xbbb", v: 27 };
  const BASE_PARAMS = {
    address: "0xuser" as const,
    direction: "fund" as const,
    dex: "xyz",
    amountUsdc: "25",
    usdcTokenId: USDC_TOKEN_ID,
    isTestnet: false,
    isUnifiedAccount: false,
  };

  beforeEach(() => {
    signUserSignedAction.mockReset();
    getChainId.mockReset();
    getChainId.mockResolvedValue(42161);
  });

  it("signs with the wallet's REAL current chain, not a fixed value", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));

    await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS });

    const signedAction = signUserSignedAction.mock.calls[0][0].action;
    expect(signedAction.signatureChainId).toBe("0xa4b1");
  });

  it("signs sourceDex \"spot\" for a Unified Account fund transfer, not \"\"", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));

    await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS, isUnifiedAccount: true });

    const signedAction = signUserSignedAction.mock.calls[0][0].action;
    expect(signedAction.sourceDex).toBe("spot");
    expect(signedAction.destinationDex).toBe("xyz");
  });

  it("submits through the existing /api/hyperliquid/order route, not directly to Hyperliquid", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } }));
    vi.stubGlobal("fetch", fetchMock);

    await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS });

    expect(fetchMock).toHaveBeenCalledWith("/api/hyperliquid/order", expect.objectContaining({ method: "POST" }));
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.address).toBe("0xuser");
    expect(body.action.type).toBe("sendAsset");
    expect(body.action.sourceDex).toBe("");
    expect(body.action.destinationDex).toBe("xyz");
    expect(body.action.token).toBe(USDC_TOKEN_ID);
    expect(body.action.amount).toBe("25");
  });

  it("a withdraw direction submits the reversed source/destination pair", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } }));
    vi.stubGlobal("fetch", fetchMock);

    await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS, direction: "withdraw" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.action.sourceDex).toBe("xyz");
    expect(body.action.destinationDex).toBe("");
  });

  it("classifies a wallet rejection distinctly, without ever calling fetch", async () => {
    signUserSignedAction.mockRejectedValue({ code: 4001, message: "User rejected" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS });

    expect(result).toEqual({ status: "wallet-rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("commands the wallet onto the chosen chainId via wallet_switchEthereumChain before signing", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));
    const provider = mockProvider();

    await signAndSubmitDexTransfer({ provider, ...BASE_PARAMS, walletChainId: 43114 });

    expect(provider.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xa86a" }],
    });
  });

  it("self-heals a stale walletChainId: retries once with a live getChainId() value after an 'active chainId is different' rejection", async () => {
    signUserSignedAction
      .mockRejectedValueOnce({ code: -32602, message: "Invalid parameters: active chainId is different than the one provided." })
      .mockResolvedValueOnce(SIGNATURE);
    getChainId.mockResolvedValue(42161);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));

    const result = await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS, walletChainId: 43114 });

    expect(signUserSignedAction).toHaveBeenCalledTimes(2);
    expect(signUserSignedAction.mock.calls[0][0].action.signatureChainId).toBe("0xa86a");
    expect(signUserSignedAction.mock.calls[1][0].action.signatureChainId).toBe("0xa4b1");
    expect(result.status).toBe("pending");
  });

  it("does not retry when the fresh getChainId() value matches the one that just failed", async () => {
    signUserSignedAction.mockRejectedValue({
      code: -32602,
      message: "Invalid parameters: active chainId is different than the one provided.",
    });
    getChainId.mockResolvedValue(43114);
    vi.stubGlobal("fetch", vi.fn());

    const result = await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS, walletChainId: 43114 });

    expect(signUserSignedAction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("rejected");
  });

  it("surfaces the real underlying error message on a non-rejection signing failure", async () => {
    signUserSignedAction.mockRejectedValue(
      new Error("Failed to sign the typed data using the wallet", {
        cause: { message: "Active chainId is 0xa4b1 but received 0x539" },
      })
    );
    vi.stubGlobal("fetch", vi.fn());

    const result = await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS });

    expect(result).toEqual({
      status: "rejected",
      reason: "invalid-request",
      message: "Couldn't sign the transfer: Active chainId is 0xa4b1 but received 0x539",
    });
  });

  it("passes isTestnet through as hyperliquidChain: Testnet", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));

    await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS, isTestnet: true });

    expect(signUserSignedAction.mock.calls[0][0].action.hyperliquidChain).toBe("Testnet");
  });

  it("classifies a network failure reaching our own route as network-failure, never a hard error", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection reset")));

    const result = await signAndSubmitDexTransfer({ provider: mockProvider(), ...BASE_PARAMS });

    expect(result.status).toBe("network-failure");
  });

  it("for a WalletConnect session, derives signatureChainId from the session's own approved chains — never a live getChainId() round trip", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));
    const wcProvider = {
      ...mockProvider(),
      session: { namespaces: { eip155: { chains: ["eip155:1", "eip155:42161"] } } },
    } as unknown as Eip1193Provider;

    await signAndSubmitDexTransfer({ provider: wcProvider, ...BASE_PARAMS });

    expect(getChainId).not.toHaveBeenCalled();
  });

  // Real, reproduced bug (2026-08-23) — see hyperliquid-agent-wallet.ts's
  // preferredApprovedChain for the full root cause. This flow duplicates
  // that same chain-selection logic, so it needs the same fix.
  it("prefers a passed-in walletChainId over the WC session's approved-list guess", async () => {
    signUserSignedAction.mockResolvedValue(SIGNATURE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: { status: "pending" } })));
    const wcProvider = {
      ...mockProvider(),
      session: { namespaces: { eip155: { chains: ["eip155:1", "eip155:42161"] } } },
    } as unknown as Eip1193Provider;

    await signAndSubmitDexTransfer({ provider: wcProvider, ...BASE_PARAMS, walletChainId: 1 });

    const signedAction = signUserSignedAction.mock.calls[0][0].action;
    expect(signedAction.signatureChainId).toBe("0x1");
  });
});
