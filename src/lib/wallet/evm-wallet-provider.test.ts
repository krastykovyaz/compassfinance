import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getApprovedAccounts,
  getChainId,
  getInjectedProvider,
  getUsdcBalance,
  isSupportedChain,
  isUserRejectedError,
  isWalletAvailable,
  requestAccounts,
  signTypedData,
  subscribeAccountsChanged,
  subscribeChainChanged,
  subscribeDisconnect,
  SUPPORTED_CHAINS,
} from "./evm-wallet-provider";

function mockProvider(overrides?: Partial<{ request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }>) {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    request: vi.fn(async () => undefined),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(event, arr.filter((h) => h !== handler));
    }),
    _emit(event: string, ...args: unknown[]) {
      for (const h of listeners.get(event) ?? []) h(...args);
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getInjectedProvider / isWalletAvailable — no window.ethereum", () => {
  it("returns null / false when no wallet is injected (window undefined)", () => {
    expect(getInjectedProvider()).toBeNull();
    expect(isWalletAvailable()).toBe(false);
  });

  it("returns null / false when window exists but ethereum is absent", () => {
    vi.stubGlobal("window", {});
    expect(getInjectedProvider()).toBeNull();
    expect(isWalletAvailable()).toBe(false);
  });

  it("returns the provider when window.ethereum is present — works for any EIP-1193 injector (MetaMask, Rabby, Coinbase Wallet, etc.), not a specific one", () => {
    const provider = mockProvider();
    vi.stubGlobal("window", { ethereum: provider });
    expect(getInjectedProvider()).toBe(provider);
    expect(isWalletAvailable()).toBe(true);
  });
});

describe("requestAccounts — connect", () => {
  it("prompts the wallet and returns the approved accounts", async () => {
    const provider = mockProvider({ request: vi.fn(async () => ["0xabc"]) });
    vi.stubGlobal("window", { ethereum: provider });

    const accounts = await requestAccounts();

    expect(accounts).toEqual(["0xabc"]);
    expect(provider.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
  });

  it("throws when no wallet is available", async () => {
    await expect(requestAccounts()).rejects.toThrow(/No injected wallet/);
  });

  it("propagates a user-rejection error, classified correctly by isUserRejectedError", async () => {
    const rejection = { code: 4001, message: "User rejected the request." };
    const provider = mockProvider({ request: vi.fn().mockRejectedValue(rejection) });
    vi.stubGlobal("window", { ethereum: provider });

    await expect(requestAccounts()).rejects.toEqual(rejection);
    expect(isUserRejectedError(rejection)).toBe(true);
  });

  it("isUserRejectedError is false for any other error shape", () => {
    expect(isUserRejectedError(new Error("network down"))).toBe(false);
    expect(isUserRejectedError({ code: -32603, message: "internal error" })).toBe(false);
    expect(isUserRejectedError(null)).toBe(false);
  });
});

describe("getApprovedAccounts — silent reconnect, never prompts", () => {
  it("returns already-approved accounts without a permission prompt", async () => {
    const provider = mockProvider({ request: vi.fn(async () => ["0xabc"]) });
    vi.stubGlobal("window", { ethereum: provider });

    const accounts = await getApprovedAccounts();

    expect(accounts).toEqual(["0xabc"]);
    expect(provider.request).toHaveBeenCalledWith({ method: "eth_accounts" });
  });

  it("returns an empty array (never throws) when no wallet is available", async () => {
    expect(await getApprovedAccounts()).toEqual([]);
  });

  it("returns an empty array (never throws) when the call itself fails", async () => {
    const provider = mockProvider({ request: vi.fn().mockRejectedValue(new Error("boom")) });
    vi.stubGlobal("window", { ethereum: provider });

    expect(await getApprovedAccounts()).toEqual([]);
  });
});

describe("getChainId — network detection", () => {
  it("parses the hex chainId into a decimal number", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0x1") });
    vi.stubGlobal("window", { ethereum: provider });

    expect(await getChainId()).toBe(1);
  });

  it("throws when no wallet is available", async () => {
    await expect(getChainId()).rejects.toThrow(/No injected wallet/);
  });

  it("falls back to the injected provider when explicitly passed null (not just when omitted) — regression: wallet-provider.tsx's wcProvider state is `null`, not `undefined`, for an injected connection, and a JS default parameter only fires on `undefined`", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0x1") });
    vi.stubGlobal("window", { ethereum: provider });

    expect(await getChainId(null)).toBe(1);
  });
});

describe("isSupportedChain", () => {
  it("is true for every chain in SUPPORTED_CHAINS", () => {
    for (const id of Object.keys(SUPPORTED_CHAINS).map(Number)) {
      expect(isSupportedChain(id)).toBe(true);
    }
  });

  it("is false for a chain not in SUPPORTED_CHAINS (e.g. BNB Chain)", () => {
    expect(isSupportedChain(56)).toBe(false);
  });
});

describe("getUsdcBalance — network detection + balance parsing", () => {
  it("returns null for an unsupported chain WITHOUT calling eth_call at all", async () => {
    const provider = mockProvider();
    vi.stubGlobal("window", { ethereum: provider });

    const balance = await getUsdcBalance("0xabc", 56); // BNB Chain — not supported

    expect(balance).toBeNull();
    expect(provider.request).not.toHaveBeenCalled();
  });

  it("decodes a real eth_call balanceOf result at the chain's USDC decimals", async () => {
    // 1_500_000 raw units at 6 decimals = 1.5 USDC
    const raw = (1_500_000).toString(16).padStart(64, "0");
    const provider = mockProvider({ request: vi.fn(async () => `0x${raw}`) });
    vi.stubGlobal("window", { ethereum: provider });

    const balance = await getUsdcBalance("0xabc", 1); // Ethereum mainnet

    expect(balance).toBeCloseTo(1.5, 6);
    expect(provider.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_call" })
    );
  });

  it("treats an empty/0x result as a real zero balance, not unavailable", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0x") });
    vi.stubGlobal("window", { ethereum: provider });

    expect(await getUsdcBalance("0xabc", 1)).toBe(0);
  });

  it("throws when no wallet is available for a supported chain", async () => {
    await expect(getUsdcBalance("0xabc", 1)).rejects.toThrow(/No injected wallet/);
  });

  it("falls back to the injected provider when explicitly passed null (not just when omitted)", async () => {
    const raw = (500_000).toString(16).padStart(64, "0");
    const provider = mockProvider({ request: vi.fn(async () => `0x${raw}`) });
    vi.stubGlobal("window", { ethereum: provider });

    expect(await getUsdcBalance("0xabc", 1, null)).toBeCloseTo(0.5, 6);
  });
});

describe("subscribeAccountsChanged / subscribeChainChanged / subscribeDisconnect — wallet-initiated events", () => {
  it("fires the callback with the new accounts on an account switch, and unsubscribes cleanly", () => {
    const provider = mockProvider();
    vi.stubGlobal("window", { ethereum: provider });

    const cb = vi.fn();
    const unsubscribe = subscribeAccountsChanged(cb);

    provider._emit("accountsChanged", ["0xnew"]);
    expect(cb).toHaveBeenCalledWith(["0xnew"]);

    unsubscribe();
    provider._emit("accountsChanged", ["0xanother"]);
    expect(cb).toHaveBeenCalledTimes(1); // not called again after unsubscribe
  });

  it("fires the callback with the parsed decimal chainId on a network switch", () => {
    const provider = mockProvider();
    vi.stubGlobal("window", { ethereum: provider });

    const cb = vi.fn();
    subscribeChainChanged(cb);

    provider._emit("chainChanged", "0x89"); // 137 = Polygon
    expect(cb).toHaveBeenCalledWith(137);
  });

  it("fires the disconnect callback", () => {
    const provider = mockProvider();
    vi.stubGlobal("window", { ethereum: provider });

    const cb = vi.fn();
    subscribeDisconnect(cb);

    provider._emit("disconnect");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("is a safe no-op (never throws) when no wallet is available", () => {
    expect(() => subscribeAccountsChanged(vi.fn())()).not.toThrow();
    expect(() => subscribeChainChanged(vi.fn())()).not.toThrow();
    expect(() => subscribeDisconnect(vi.fn())()).not.toThrow();
  });

  it("falls back to the injected provider when explicitly passed null (not just when omitted)", () => {
    const provider = mockProvider();
    vi.stubGlobal("window", { ethereum: provider });

    const cb = vi.fn();
    subscribeAccountsChanged(cb, null);
    provider._emit("accountsChanged", ["0xnew"]);
    expect(cb).toHaveBeenCalledWith(["0xnew"]);
  });
});

describe("signTypedData — the one signing method (Phase 4 real order execution)", () => {
  const DOMAIN = { name: "Exchange", version: "1", chainId: 1337, verifyingContract: "0x0000000000000000000000000000000000000000" };
  const TYPES = { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] };
  const MESSAGE = { source: "a", connectionId: "0xdeadbeef" };

  it("calls eth_signTypedData_v4 with the address and a JSON-encoded typed-data payload, returning the wallet's signature", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0xsignature") });
    vi.stubGlobal("window", { ethereum: provider });

    const sig = await signTypedData("0xabc", DOMAIN, TYPES, "Agent", MESSAGE);

    expect(sig).toBe("0xsignature");
    expect(provider.request).toHaveBeenCalledTimes(1);
    const call = vi.mocked(provider.request).mock.calls[0][0] as { method: string; params: [string, string] };
    expect(call.method).toBe("eth_signTypedData_v4");
    expect(call.params[0]).toBe("0xabc");
    const payload = JSON.parse(call.params[1]);
    expect(payload.domain).toEqual(DOMAIN);
    expect(payload.primaryType).toBe("Agent");
    expect(payload.message).toEqual(MESSAGE);
    expect(payload.types.Agent).toEqual(TYPES.Agent);
  });

  it("declares the EIP712Domain type fields matching whichever domain fields are actually present", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0xsignature") });
    vi.stubGlobal("window", { ethereum: provider });

    await signTypedData("0xabc", DOMAIN, TYPES, "Agent", MESSAGE);

    const call = vi.mocked(provider.request).mock.calls[0][0] as unknown as { params: [string, string] };
    const payload = JSON.parse(call.params[1]);
    const domainFieldNames = payload.types.EIP712Domain.map((f: { name: string }) => f.name);
    expect(domainFieldNames.sort()).toEqual(["chainId", "name", "verifyingContract", "version"]);
  });

  it("omits an EIP712Domain field the domain object doesn't actually have (e.g. no salt)", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0xsignature") });
    vi.stubGlobal("window", { ethereum: provider });

    await signTypedData("0xabc", DOMAIN, TYPES, "Agent", MESSAGE);

    const call = vi.mocked(provider.request).mock.calls[0][0] as unknown as { params: [string, string] };
    const payload = JSON.parse(call.params[1]);
    const domainFieldNames = payload.types.EIP712Domain.map((f: { name: string }) => f.name);
    expect(domainFieldNames).not.toContain("salt");
  });

  it("throws when no wallet is available", async () => {
    await expect(signTypedData("0xabc", DOMAIN, TYPES, "Agent", MESSAGE)).rejects.toThrow(/No injected wallet/);
  });

  it("propagates a user-rejection error, classified correctly by isUserRejectedError — signing must never crash on a normal decline", async () => {
    const rejection = { code: 4001, message: "User rejected the request." };
    const provider = mockProvider({ request: vi.fn().mockRejectedValue(rejection) });
    vi.stubGlobal("window", { ethereum: provider });

    await expect(signTypedData("0xabc", DOMAIN, TYPES, "Agent", MESSAGE)).rejects.toEqual(rejection);
    expect(isUserRejectedError(rejection)).toBe(true);
  });

  it("falls back to the injected provider when explicitly passed null (not just when omitted)", async () => {
    const provider = mockProvider({ request: vi.fn(async () => "0xsignature") });
    vi.stubGlobal("window", { ethereum: provider });

    await expect(signTypedData("0xabc", DOMAIN, TYPES, "Agent", MESSAGE, null)).resolves.toBe("0xsignature");
  });
});
