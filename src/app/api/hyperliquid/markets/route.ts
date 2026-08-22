// GET /api/hyperliquid/markets
//
// The only thing client code calls to get live Hyperliquid perpetual
// market snapshots (price, 24h change/volume, funding). Server-side
// boundary in front of src/server/hyperliquid/service.ts — client code
// never talks to Hyperliquid directly. No auth: this is public market
// data, not user-specific (same stance as /api/market/quote).

import { NextResponse } from "next/server";
import { isHyperliquidEnabled, isHyperliquidTestnet } from "@/server/hyperliquid/config";
import { getHyperliquidMarkets } from "@/server/hyperliquid/service";

export async function GET() {
  const result = await getHyperliquidMarkets();
  // isTestnet lets the client (Phase 4's order signer) know which network
  // it's about to sign for, without needing its own NEXT_PUBLIC_ env var —
  // this is the same request the trading page already makes for a fresh
  // price right before signing, so it's not an extra round trip.
  return NextResponse.json({ enabled: isHyperliquidEnabled(), isTestnet: isHyperliquidTestnet(), result });
}
