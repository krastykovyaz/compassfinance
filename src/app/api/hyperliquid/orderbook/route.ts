// GET /api/hyperliquid/orderbook?coin=BTC
//
// Server-side boundary in front of src/server/hyperliquid/service.ts's
// getHyperliquidOrderBook(). No auth — public market data.

import { NextResponse } from "next/server";
import { getHyperliquidOrderBook } from "@/server/hyperliquid/service";

export async function GET(request: Request) {
  const coin = new URL(request.url).searchParams.get("coin");

  if (!coin) {
    return NextResponse.json({ error: "coin query parameter is required" }, { status: 400 });
  }

  const result = await getHyperliquidOrderBook(coin);
  return NextResponse.json({ result });
}
