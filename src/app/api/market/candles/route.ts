// GET /api/market/candles?symbol=sp500&range=1D
//
// The only thing client code calls to get chart data. See
// src/app/api/market/quote/route.ts for the same rationale — this route
// is the server-side boundary in front of src/server/market/service.ts.

import { NextResponse } from "next/server";
import { getCandles } from "@/server/market/service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");
  const range = url.searchParams.get("range");

  if (!symbol || !range) {
    return NextResponse.json(
      { error: "symbol and range query parameters are required" },
      { status: 400 }
    );
  }

  const result = await getCandles(symbol, range);
  return NextResponse.json({ result });
}
