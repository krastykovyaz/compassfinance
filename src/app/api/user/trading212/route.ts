import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import {
  connectTrading212,
  disconnectTrading212,
  getTrading212Connection,
} from "@/server/repositories/trading212-repository";

// Phase 1 — connection only, never sync (see the repository's own header
// comment). userId always comes from requireUserId() (the session), never
// from the request body/query — see api-routes-idor.test.ts's structural
// scan of every route under this directory for exactly that invariant.

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return { connection: await getTrading212Connection(userId) };
  });
}

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    const apiKey = body?.apiKey;
    const apiSecret = body?.apiSecret;
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw new Error("A Trading 212 API Key is required");
    }
    if (typeof apiSecret !== "string" || !apiSecret.trim()) {
      throw new Error("A Trading 212 API Secret is required");
    }

    const result = await connectTrading212(userId, apiKey.trim(), apiSecret.trim());
    if (result.status === "connected") {
      return { connection: result.connection };
    }
    // Never the raw validation error/upstream response — connectTrading212
    // already reduces it to one of a small set of safe, fixed messages.
    throw new Error(result.message);
  });
}

export async function DELETE() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    await disconnectTrading212(userId);
    return { disconnected: true };
  });
}
