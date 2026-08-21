import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type WalletRow = { userId: string; address: string; chain: string; createdAt: Date; verifiedAt: Date | null };

const walletStore = new Map<string, WalletRow>(); // keyed by `${address}::${chain}`
const key = (address: string, chain: string) => `${address}::${chain}`;

const prismaMock = {
  walletIdentity: {
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { address_chain: { address: string; chain: string } };
        create: WalletRow;
        update: Partial<WalletRow>;
      }) => {
        const { address, chain } = where.address_chain;
        const k = key(address, chain);
        const existing = walletStore.get(k);
        const row: WalletRow = existing
          ? { ...existing, ...update }
          : { ...create, createdAt: create.createdAt ?? new Date() };
        walletStore.set(k, row);
        return row;
      }
    ),
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
      return [...walletStore.values()]
        .filter((r) => r.userId === where.userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
  },
};

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    walletIdentity: {
      upsert: (...args: unknown[]) => prismaMock.walletIdentity.upsert(...(args as [never])),
      findMany: (...args: unknown[]) => prismaMock.walletIdentity.findMany(...(args as [never])),
    },
  },
}));

import { linkWallet, listWallets, getPrimaryWallet } from "./wallet-repository";

beforeEach(() => {
  walletStore.clear();
  vi.clearAllMocks();
});

describe("linkWallet", () => {
  it("creates a new wallet association with a real verifiedAt timestamp", async () => {
    const wallet = await linkWallet("user-1", "0xabc", "Ethereum");
    expect(wallet.address).toBe("0xabc");
    expect(wallet.chain).toBe("Ethereum");
    expect(wallet.verifiedAt).not.toBeNull();
  });

  it("upserts in place on a repeat link for the same user — no duplicate rows", async () => {
    await linkWallet("user-1", "0xabc", "Ethereum");
    await linkWallet("user-1", "0xabc", "Ethereum");
    expect(await listWallets("user-1")).toHaveLength(1);
  });

  it("reassigns an address to a different user on a later connect (last-connector-wins)", async () => {
    await linkWallet("user-1", "0xabc", "Ethereum");
    await linkWallet("user-2", "0xabc", "Ethereum");

    expect(await listWallets("user-1")).toHaveLength(0);
    const wallets = await listWallets("user-2");
    expect(wallets).toHaveLength(1);
    expect(wallets[0].address).toBe("0xabc");
  });

  it("treats the same address on different chains as independent links", async () => {
    await linkWallet("user-1", "0xabc", "Ethereum");
    await linkWallet("user-1", "0xabc", "Arbitrum One");
    expect(await listWallets("user-1")).toHaveLength(2);
  });
});

describe("listWallets / getPrimaryWallet", () => {
  it("returns only the calling user's wallets", async () => {
    await linkWallet("user-1", "0xabc", "Ethereum");
    await linkWallet("user-2", "0xdef", "Ethereum");

    expect(await listWallets("user-1")).toEqual([expect.objectContaining({ address: "0xabc" })]);
  });

  it("getPrimaryWallet returns null when nothing is linked", async () => {
    expect(await getPrimaryWallet("user-1")).toBeNull();
  });

  it("getPrimaryWallet returns the most recently linked wallet", async () => {
    await linkWallet("user-1", "0xold", "Ethereum");
    await new Promise((r) => setTimeout(r, 2));
    await linkWallet("user-1", "0xnew", "Ethereum");

    const primary = await getPrimaryWallet("user-1");
    expect(primary?.address).toBe("0xnew");
  });
});
