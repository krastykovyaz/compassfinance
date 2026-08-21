// GET /api/hyperliquid/markets
//
// The only thing client code calls to get live Hyperliquid perpetual
// market snapshots (price, 24h change/volume, funding). Server-side
// boundary in front of src/server/hyperliquid/service.ts — client code
// never talks to Hyperliquid directly. No auth: this is public market
// data, not user-specific (same stance as /api/market/quote).

import { NextResponse } from "next/server";
import { isHyperliquidEnabled } from "@/server/hyperliquid/config";
import { getHyperliquidMarkets } from "@/server/hyperliquid/service";

export async function GET() {
  const result = await getHyperliquidMarkets();
  return NextResponse.json({ enabled: isHyperliquidEnabled(), result });
}
