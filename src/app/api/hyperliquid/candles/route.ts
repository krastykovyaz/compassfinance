// GET /api/hyperliquid/candles?coin=BTC&range=1D
//
// Server-side boundary in front of src/server/hyperliquid/service.ts's
// getHyperliquidCandles(). No auth — public market data.

import { NextResponse } from "next/server";
import { getHyperliquidCandles } from "@/server/hyperliquid/service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const coin = url.searchParams.get("coin");
  const range = url.searchParams.get("range");

  if (!coin || !range) {
    return NextResponse.json({ error: "coin and range query parameters are required" }, { status: 400 });
  }

  const result = await getHyperliquidCandles(coin, range);
  return NextResponse.json({ result });
}
