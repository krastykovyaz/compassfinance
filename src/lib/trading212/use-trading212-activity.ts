"use client";

import { useEffect, useState } from "react";
import type { NormalizedActivityItem } from "@/lib/trading212/activity-normalizer";
import type { Trading212ActivityKindFilter } from "@/server/repositories/trading212-activity-repository";

export type Trading212ActivityState =
  | { stage: "loading" }
  | { stage: "loaded"; items: NormalizedActivityItem[]; nextCursor: string | null; loadingMore: boolean }
  | { stage: "error" };

type ActivityResponse = { activity: NormalizedActivityItem[]; nextCursor: string | null };

async function fetchPage(params: URLSearchParams): Promise<ActivityResponse> {
  const qs = params.toString();
  const res = await fetch(`/api/user/trading212/activity${qs ? `?${qs}` : ""}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`activity fetch failed (${res.status})`);
  return (await res.json()) as ActivityResponse;
}

/** Fetches the Trading 212 activity feed — cursor-paginated
 * (Requirement 11), optionally filtered to one CompassFinance asset (the
 * asset-detail page's per-asset history section) and/or one activity
 * `kind` (Requirement 10's filter chips). Changing `assetId`/`kind`/
 * `limit` restarts pagination from the beginning; `loadMore()` appends
 * the next page using the server's own `nextCursor`, never a
 * client-computed offset. */
export function useTrading212Activity(options?: {
  assetId?: string;
  kind?: Trading212ActivityKindFilter;
  limit?: number;
}) {
  const [state, setState] = useState<Trading212ActivityState>({ stage: "loading" });
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
      // Requirement 18: a failed "load more" doesn't wipe out the page
      // already shown — just stop the loading-more spinner and leave the
      // existing items and nextCursor as they were, so the user can
      // retry the same load-more tap.
      setState((prev) => (prev.stage === "loaded" ? { ...prev, loadingMore: false } : prev));
    }
  }

  return { ...state, loadMore };
}
