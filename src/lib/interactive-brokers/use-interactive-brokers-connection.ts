"use client";

import { useEffect, useState } from "react";

export type InteractiveBrokersConnectionDTO = {
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  /** How it was connected: the vendor OAuth flow or a Flex report. */
  method: "oauth" | "flex";
  lastConnectedAt: string | null;
};

export type InteractiveBrokersConnectionState =
  | { stage: "loading" }
  | {
      stage: "loaded";
      connection: InteractiveBrokersConnectionDTO | null;
      /** False until Interactive Brokers has approved CompassFinance and the
       * server has its IBKR_* settings; the vendor sign-in button is hidden
       * while it is false because it can only end in an error. */
      oauthAvailable: boolean;
    }
  | { stage: "error" };

/** The one place that fetches GET /api/user/interactive-brokers — shared
 * by InteractiveBrokersCard and the Settings page's "Connected accounts"
 * count, mirroring useTrading212Connection's exact reasoning (one fetch
 * implementation, not two copies that can drift). */
export function useInteractiveBrokersConnection() {
  const [state, setState] = useState<InteractiveBrokersConnectionState>({ stage: "loading" });

  async function load() {
    try {
      const res = await fetch("/api/user/interactive-brokers", { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        setState({ stage: "error" });
        return;
      }
      const body = (await res.json()) as { connection: InteractiveBrokersConnectionDTO | null; oauthAvailable?: boolean };
      setState({ stage: "loaded", connection: body.connection, oauthAvailable: body.oauthAvailable === true });
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
