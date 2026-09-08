"use client";

import { useEffect, useState } from "react";

export type Trading212ConnectionDTO = {
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  syncStatus: "NEVER_SYNCED" | "SYNCING" | "SYNCED" | "FAILED";
  syncError: string | null;
  lastFailedSyncAt: string | null;
};

export type Trading212ConnectionState =
  | { stage: "loading" }
  | { stage: "loaded"; connection: Trading212ConnectionDTO | null }
  | { stage: "error" };

/** The one place that fetches GET /api/user/trading212 — shared by
 * Trading212Card (which needs the full DTO to render) and the Settings
 * page (which only needs to know whether a connection exists at all, for
 * the "Connected accounts" row's count) so there's exactly one fetch
 * implementation instead of two copies drifting apart. */
export function useTrading212Connection() {
  const [state, setState] = useState<Trading212ConnectionState>({ stage: "loading" });

  async function load() {
    try {
      const res = await fetch("/api/user/trading212", { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        setState({ stage: "error" });
        return;
      }
      const body = (await res.json()) as { connection: Trading212ConnectionDTO | null };
      setState({ stage: "loaded", connection: body.connection });
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
