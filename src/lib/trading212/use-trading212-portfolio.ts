"use client";

import { useEffect, useState } from "react";
import type { Trading212PortfolioDTO } from "@/server/repositories/trading212-portfolio-repository";

export type Trading212PortfolioState =
  | { stage: "loading" }
  | { stage: "loaded"; portfolio: Trading212PortfolioDTO | null }
  | { stage: "error" };

/** Fetches the Portfolio page's Trading 212 section data. `portfolio ===
 * null` means "no Trading 212 connection" (the panel renders nothing);
 * `{account: null, positions: []}` means "connected, never synced yet." */
export function useTrading212Portfolio() {
  const [state, setState] = useState<Trading212PortfolioState>({ stage: "loading" });

  async function load() {
    try {
      const res = await fetch("/api/user/trading212/portfolio", { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        setState({ stage: "error" });
        return;
      }
      const body = (await res.json()) as { portfolio: Trading212PortfolioDTO | null };
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
