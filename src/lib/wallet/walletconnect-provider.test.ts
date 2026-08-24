import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Eip1193Provider } from "./wallet-types";

// The SDK is mocked at the module boundary — these tests never open a real
// relay connection. `EthereumProvider.init` is the ONLY entry point
// walletconnect-provider.ts calls into the package.
const initMock = vi.fn();

vi.mock("@walletconnect/ethereum-provider", () => ({
  EthereumProvider: { init: initMock },
}));

type MockProvider = Eip1193Provider & {
  accounts: string[];
  session: unknown;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function makeMockProvider(overrides?: { accounts?: string[]; session?: unknown }): MockProvider {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    accounts: overrides?.accounts ?? [],
    session: overrides?.session,
    request: vi.fn(async () => undefined),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
    }),
    removeListener: vi.fn((event: string) => {
      listeners.delete(event);
    }),
    // Mirrors the real SDK: connect() emits display_uri before resolving.
    connect: vi.fn(async () => {
      listeners.get("display_uri")?.("wc:mock-uri@2");
    }),
    disconnect: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.resetModules();
  initMock.mockReset();
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "test-project-id";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
});

describe("isWalletConnectConfigured", () => {
  it("is true when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set", async () => {
    const { isWalletConnectConfigured } = await import("./walletconnect-provider");
    expect(isWalletConnectConfigured()).toBe(true);
  });

  it("is false when unset", async () => {
    delete process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    const { isWalletConnectConfigured } = await import("./walletconnect-provider");
    expect(isWalletConnectConfigured()).toBe(false);
  });
});

describe("getRestoredWalletConnectSession — silent check, never prompts", () => {
  it("returns null when not configured, without ever calling the SDK", async () => {
    delete process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    const { getRestoredWalletConnectSession } = await import("./walletconnect-provider");
    expect(await getRestoredWalletConnectSession()).toBeNull();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("returns null when initialized but there is no persisted session", async () => {
    initMock.mockResolvedValue(makeMockProvider({ accounts: [], session: undefined }));
    const { getRestoredWalletConnectSession } = await import("./walletconnect-provider");
    expect(await getRestoredWalletConnectSession()).toBeNull();
  });

  it("returns the provider and first account when a session is already active — never calls connect()", async () => {
    const provider = makeMockProvider({ accounts: ["0xabc"], session: { topic: "t" } });
    initMock.mockResolvedValue(provider);
    const { getRestoredWalletConnectSession } = await import("./walletconnect-provider");

    const result = await getRestoredWalletConnectSession();

    expect(result).toEqual({ provider, address: "0xabc" });
    expect(provider.connect).not.toHaveBeenCalled();
  });
});

describe("connectWalletConnect — fresh pairing", () => {
  it("surfaces the display_uri and resolves with the connected provider + address", async () => {
    const provider = makeMockProvider({ accounts: ["0xdef"] });
    initMock.mockResolvedValue(provider);
    const { connectWalletConnect } = await import("./walletconnect-provider");

    const onUri = vi.fn();
    const result = await connectWalletConnect(onUri);

    expect(onUri).toHaveBeenCalledWith("wc:mock-uri@2");
    expect(result).toEqual({ provider, address: "0xdef" });
    expect(provider.connect).toHaveBeenCalled();
  });

  it("throws if the wallet approves without returning an account", async () => {
    const provider = makeMockProvider({ accounts: [] });
    initMock.mockResolvedValue(provider);
    const { connectWalletConnect } = await import("./walletconnect-provider");

    await expect(connectWalletConnect(vi.fn())).rejects.toThrow(/No account/);
  });

  it("memoizes the in-flight init promise — concurrent callers share one init() call", async () => {
    let resolveInit: (p: unknown) => void = () => {};
    initMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInit = resolve;
      })
    );
    const { getWalletConnectProvider } = await import("./walletconnect-provider");

    const p1 = getWalletConnectProvider();
    const p2 = getWalletConnectProvider();
    await new Promise((resolve) => setTimeout(resolve, 0)); // flush the dynamic import()
    expect(initMock).toHaveBeenCalledTimes(1);

    const provider = makeMockProvider({ accounts: ["0x1"] });
    resolveInit(provider);
    await expect(p1).resolves.toBe(provider);
    await expect(p2).resolves.toBe(provider);
  });
});

describe("disconnectWalletConnect", () => {
  it("calls the provider's disconnect()", async () => {
    const provider = makeMockProvider({ accounts: ["0xabc"] });
    const { disconnectWalletConnect } = await import("./walletconnect-provider");

    await disconnectWalletConnect(provider);

    expect(provider.disconnect).toHaveBeenCalled();
  });

  it("never throws even if the underlying disconnect rejects", async () => {
    const provider = makeMockProvider({ accounts: ["0xabc"] });
    provider.disconnect = vi.fn().mockRejectedValue(new Error("relay down"));
    const { disconnectWalletConnect } = await import("./walletconnect-provider");

    await expect(disconnectWalletConnect(provider)).resolves.toBeUndefined();
  });
});
