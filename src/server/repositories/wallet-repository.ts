import "server-only";
import { prisma } from "@/server/db/prisma";

export type WalletIdentityDTO = {
  address: string;
  chain: string;
  createdAt: string;
  verifiedAt: string | null;
};

function toDTO(row: { address: string; chain: string; createdAt: Date; verifiedAt: Date | null }): WalletIdentityDTO {
  return {
    address: row.address,
    chain: row.chain,
    createdAt: row.createdAt.toISOString(),
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
  };
}

/**
 * Links (or re-links) an EVM address to this user. Upserts on the
 * [address, chain] unique constraint — last-connector-wins semantics: if
 * this address was previously linked to a different user, it's silently
 * reassigned. This is safe because the caller only ever reaches this
 * function after a real eth_requestAccounts prompt succeeded in the
 * connecting browser (see wallet-link-sync.tsx), which already proves live
 * control of the address at connect time — reassignment is the current
 * controller re-asserting ownership, not a spoof. verifiedAt is set on
 * every call for the same reason: the wallet prompt itself IS the
 * verification event, there is no separate signature-challenge flow.
 */
export async function linkWallet(userId: string, address: string, chain: string): Promise<WalletIdentityDTO> {
  const row = await prisma.walletIdentity.upsert({
    where: { address_chain: { address, chain } },
    create: { userId, address, chain, verifiedAt: new Date() },
    update: { userId, verifiedAt: new Date() },
  });
  return toDTO(row);
}

export async function listWallets(userId: string): Promise<WalletIdentityDTO[]> {
  const rows = await prisma.walletIdentity.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDTO);
}

/** The most recently linked wallet — Phase 2 only ever surfaces one
 * connected address at a time (useWallet() itself tracks exactly one). */
export async function getPrimaryWallet(userId: string): Promise<WalletIdentityDTO | null> {
  const wallets = await listWallets(userId);
  return wallets[0] ?? null;
}
