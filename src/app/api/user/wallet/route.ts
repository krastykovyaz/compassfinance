import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { isValidEvmAddress } from "@/server/validation";
import { linkWallet, listWallets } from "@/server/repositories/wallet-repository";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return { wallets: await listWallets(userId) };
  });
}

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const address = body?.address;
    const chain = body?.chain;
    if (typeof address !== "string" || !isValidEvmAddress(address)) {
      throw new Error("A valid EVM address is required");
    }
    if (typeof chain !== "string" || !chain.trim()) {
      throw new Error("chain is required");
    }
    const wallet = await linkWallet(userId, address, chain);
    return { wallet };
  });
}
