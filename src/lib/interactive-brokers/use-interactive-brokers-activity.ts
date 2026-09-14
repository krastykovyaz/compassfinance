"use client";

import { useEffect, useState } from "react";
import type { NormalizedActivityItem } from "@/lib/portfolio/activity-normalizer";
import type { InteractiveBrokersActivityKindFilter } from "@/server/repositories/interactive-brokers-activity-repository";

export type InteractiveBrokersActivityState =
  | { stage: "loading" }
  | { stage: "loaded"; items: NormalizedActivityItem[]; nextCursor: string | null; loadingMore: boolean }
  | { stage: "error" };

type ActivityResponse = { activity: NormalizedActivityItem[]; nextCursor: string | null };

async function fetchPage(params: URLSearchParams): Promise<ActivityResponse> {
  const qs = params.toString();
  const res = await fetch(`/api/user/interactive-brokers/activity${qs ? `?${qs}` : ""}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`activity fetch failed (${res.status})`);
  return (await res.json()) as ActivityResponse;
}

/** Fetches the Interactive Brokers activity feed — mirrors
 * useTrading212Activity's exact cursor-pagination/filter contract. */
export function useInteractiveBrokersActivity(options?: {
  assetId?: string;
  kind?: InteractiveBrokersActivityKindFilter;
  limit?: number;
}) {
  const [state, setState] = useState<InteractiveBrokersActivityState>({ stage: "loading" });
  const assetId = options?.assetId;
  const kind = options?.kind;
  const limit = options?.limit;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ stage: "loading" });
      try {
        const params = new URLSearchParams();
        if (assetId) params.set("assetId", assetId);
        if (kind) params.set("kind", kind);
        if (limit) params.set("limit", String(limit));
        const body = await fetchPage(params);
        if (!cancelled) setState({ stage: "loaded", items: body.activity, nextCursor: body.nextCursor, loadingMore: false });
      } catch {
        if (!cancelled) setState({ stage: "error" });
      }
    }
    const kickoff = setTimeout(load, 0);
    return () => {
      cancelled = true;
      clearTimeout(kickoff);
    };
  }, [assetId, kind, limit]);

  async function loadMore() {
    if (state.stage !== "loaded" || !state.nextCursor || state.loadingMore) return;
    const cursor = state.nextCursor;
    setState({ ...state, loadingMore: true });
    try {
      const params = new URLSearchParams();
      if (assetId) params.set("assetId", assetId);
      if (kind) params.set("kind", kind);
      if (limit) params.set("limit", String(limit));
      params.set("cursor", cursor);
      const body = await fetchPage(params);
      setState((prev) =>
        prev.stage === "loaded"
          ? { stage: "loaded", items: [...prev.items, ...body.activity], nextCursor: body.nextCursor, loadingMore: false }
          : prev
      );
    } catch {
      setState((prev) => (prev.stage === "loaded" ? { ...prev, loadingMore: false } : prev));
    }
  }

  return { ...state, loadMore };
}
