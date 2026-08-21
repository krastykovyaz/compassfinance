// GET /api/market/quote?symbols=sp500,nasdaq,dow
//
// The only thing client code calls to get current prices. This route runs
// on the server, calls src/server/market/service.ts (which talks to Yahoo
// Finance), and never leaks Yahoo request details to the client — the
// client only ever sees { results: QuoteResult[] }.
//
// No auth required: market prices aren't user-specific data (same as
// /api/news).

import { NextResponse } from "next/server";
import { getQuotes } from "@/server/market/service";

export async function GET(request: Request) {
  const symbolsParam = new URL(request.url).searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ error: "symbols query parameter is required" }, { status: 400 });
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query parameter is required" }, { status: 400 });
  }

  const results = await getQuotes(symbols);
  return NextResponse.json({ results });
}
