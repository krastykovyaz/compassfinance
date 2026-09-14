"use client";

import { useEffect, useState } from "react";
import type { InteractiveBrokersPortfolioDTO } from "@/server/repositories/interactive-brokers-portfolio-repository";

export type InteractiveBrokersPortfolioState =
  | { stage: "loading" }
  | { stage: "loaded"; portfolio: InteractiveBrokersPortfolioDTO | null }
  | { stage: "error" };

/** Fetches the Portfolio page's Interactive Brokers section data —
 * mirrors useTrading212Portfolio's exact contract: `portfolio === null`
 * means "no IBKR connection" (the panel renders nothing); `{accountId:
 * null, account: null, positions: []}` means "connected, never synced
 * yet." */
export function useInteractiveBrokersPortfolio() {
  const [state, setState] = useState<InteractiveBrokersPortfolioState>({ stage: "loading" });

  async function load() {
    try {
      const res = await fetch("/api/user/interactive-brokers/portfolio", { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        setState({ stage: "error" });
        return;
      }
      const body = (await res.json()) as { portfolio: InteractiveBrokersPortfolioDTO | null };
      setState({ stage: "loaded", portfolio: body.portfolio });
    } catch {
      setState({ stage: "error" });
    }
  }

  useEffect(() => {
    const kickoff = setTimeout(load, 0);
    return () => clearTimeout(kickoff);
  }, []);

  return { ...state, refresh: load };
}
