"use client";

// Trading 212 connection card (Phase 1 — connect/disconnect only, no
// portfolio/trade/history sync yet). Mirrors wallet-card.tsx's shape
// (status display + connect/disconnect actions) for a consistent
// "external connection" pattern across the Settings page, but is
// otherwise fully independent — no shared state, no shared component.
//
// Status/timestamps come from GET /api/user/trading212, which only ever
// returns the safe DTO (see trading212-repository.ts) — this component
// never sees, requests, or could render a credential even by accident.

import { useState } from "react";
import { Landmark, Loader2, TriangleAlert, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { describeTrading212SyncState } from "@/lib/trading212/sync-state";
import { formatRelativeTime } from "@/lib/utils";
import { useTrading212Connection } from "@/lib/trading212/use-trading212-connection";
import { Trading212ConnectModal } from "./trading212-connect-modal";

// Local, client-driven sync state for THIS button click — separate from
// `connection.syncStatus` (persisted server-side, reflects the last
// completed attempt) because a click needs an immediate "Syncing…" state
// before the request round-trip returns anything to read back.
type SyncUiState =
  | { stage: "idle" }
  | { stage: "syncing" }
  | { stage: "success" }
  | { stage: "failed"; message: string }
  // Phase 5: the automatic scheduler (or a duplicate click) is already
  // syncing this exact connection — not a failure, just "wait".
  | { stage: "already_syncing" };

export function Trading212Card() {
  const { t, locale } = useTranslation();
  const state = useTrading212Connection();
  const load = state.refresh;
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncState, setSyncState] = useState<SyncUiState>({ stage: "idle" });

  async function handleSync() {
    setSyncState({ stage: "syncing" });
    try {
      const res = await fetch("/api/user/trading212/sync", { method: "POST", signal: AbortSignal.timeout(30_000) });
      const body = (await res.json().catch(() => null)) as { status?: string; message?: string; error?: string } | null;
      if (!res.ok) {
        setSyncState({ stage: "failed", message: body?.error ?? t("trading212.syncFailed") });
      } else if (body?.status === "already_syncing") {
        setSyncState({ stage: "already_syncing" });
      } else if (body?.status === "failed") {
        setSyncState({ stage: "failed", message: body.message ?? t("trading212.syncFailed") });
      } else {
        setSyncState({ stage: "success" });
      }
    } catch {
      setSyncState({ stage: "failed", message: t("trading212.syncFailed") });
    } finally {
      load();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/user/trading212", { method: "DELETE", signal: AbortSignal.timeout(10_000) });
    } finally {
      setDisconnecting(false);
      setConfirmingDisconnect(false);
      load();
    }
  }

  const isConnected = state.stage === "loaded" && state.connection?.status === "CONNECTED";
  const lastConnectedAt = state.stage === "loaded" ? (state.connection?.lastConnectedAt ?? null) : null;
  // Requirement 10: a sync failure from an EARLIER session (nothing
  // clicked in this one) must still show up on load — not just the
  // ephemeral `syncState` from a fresh click in the current session. This
  // reads the real persisted syncStatus/syncError/lastSyncAt off the
  // connection, same helper the Portfolio page's panel uses, so the two
  // places can never disagree about what "failed" means.
  const persistedSyncView =
    state.stage === "loaded" && state.connection
      ? describeTrading212SyncState({
          syncStatus: state.connection.syncStatus,
          syncError: state.connection.syncError,
          lastSyncAt: state.connection.lastSyncAt,
          connectionStatus: state.connection.status,
        })
      : null;
  // The raw timestamp, shown regardless of the CURRENT syncStatus — a
  // sync that just failed doesn't erase the fact that an earlier sync
  // genuinely succeeded at this real time (see persistedSyncView's own
  // "failed always wins" note: that's about which BANNER to show, not
  // about hiding a real past success).
  const lastSyncAt = state.stage === "loaded" ? (state.connection?.lastSyncAt ?? null) : null;
  const lastFailedSyncAt = state.stage === "loaded" ? (state.connection?.lastFailedSyncAt ?? null) : null;
  // Requirement 13: the button must debounce against BOTH a click made in
  // THIS session (syncState) and a sync already under way for another
  // reason entirely — the automatic scheduler, or a click from a second
  // open tab — which only the freshly-loaded persisted state can reveal.
  const syncInProgress =
    syncState.stage === "syncing" || syncState.stage === "already_syncing" || persistedSyncView?.kind === "syncing";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-muted">{t("trading212.cardTitle")}</p>
        {state.stage === "loaded" ? (
          <button
            aria-label={t("trading212.refresh")}
            onClick={() => void load()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2"
          >
            <RefreshCw size={13} />
          </button>
        ) : null}
      </div>

      {state.stage === "loading" ? (
        <div className="mt-2 flex items-center justify-center py-4">
          <Loader2 size={18} className="animate-spin text-ink-faint" />
        </div>
      ) : state.stage === "error" ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{t("trading212.loadError")}</span>
        </div>
      ) : isConnected ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-600">
              <Landmark size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
                <span className="h-2 w-2 shrink-0 rounded-full bg-positive" />
                {t("trading212.connected")}
              </p>
              <p className="text-xs text-ink-muted">
                {t("trading212.lastConnected")}:{" "}
                {lastConnectedAt ? new Date(lastConnectedAt).toLocaleString(locale) : "—"}
              </p>
              <p className="text-xs text-ink-muted">
                {t("trading212.lastSynced")}: {lastSyncAt ? formatRelativeTime(lastSyncAt) : t("trading212.neverSynced")}
              </p>
              {lastFailedSyncAt && persistedSyncView?.kind === "failed" ? (
                <p className="text-xs text-ink-muted">
                  {t("trading212.lastFailedSync")}: {formatRelativeTime(lastFailedSyncAt)}
                </p>
              ) : null}
              {persistedSyncView?.kind === "synced" && persistedSyncView.staleness !== "stale" ? (
                <p
                  className={
                    persistedSyncView.staleness === "fresh"
                      ? "text-xs font-medium text-positive"
                      : "text-xs font-medium text-ink-muted"
                  }
                >
                  {t("trading212.syncStatusLabel")}:{" "}
                  {persistedSyncView.staleness === "fresh" ? t("trading212.upToDate") : t("trading212.dataMayBeOutdated")}
                </p>
              ) : null}
            </div>
          </div>

          {syncState.stage === "failed" ? (
            <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{syncState.message}</span>
            </div>
          ) : syncState.stage === "already_syncing" ? (
            <p className="mt-3 text-xs font-medium text-ink-muted">{t("trading212.alreadySyncing")}</p>
          ) : syncState.stage === "success" ? (
            <p className="mt-3 text-xs font-medium text-positive">{t("trading212.syncSuccess")}</p>
          ) : persistedSyncView?.kind === "failed" ? (
            <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>
                {persistedSyncView.needsAttention ? `${t("trading212.connectionNeedsAttention")} — ` : `${t("trading212.syncFailed")}: `}
                {persistedSyncView.message}
              </span>
            </div>
          ) : null}

          {confirmingDisconnect ? (
            <div className="mt-3 rounded-xl bg-negative-bg px-3 py-2.5 text-xs text-negative">
              <p className="flex items-start gap-1.5">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>{t("trading212.disconnectConfirm")}</span>
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={disconnecting}
                  className="flex-1 rounded-full border border-border py-1.5 text-[12px] font-medium text-ink disabled:opacity-60"
                >
                  {t("general.cancel")}
                </button>
                <button
                  onClick={() => void handleDisconnect()}
                  disabled={disconnecting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-negative py-1.5 text-[12px] font-medium text-surface disabled:opacity-60"
                >
                  {disconnecting ? <Loader2 size={13} className="animate-spin" /> : null}
                  {t("trading212.disconnectButton")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void handleSync()}
                disabled={syncInProgress}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2 text-[13px] font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
              >
                {syncInProgress ? <Loader2 size={13} className="animate-spin" /> : null}
                {syncInProgress ? t("trading212.syncing") : t("trading212.syncButton")}
              </button>
              <button
                onClick={() => setConfirmingDisconnect(true)}
                className="flex-1 rounded-full border border-border py-2 text-[13px] font-medium text-ink hover:bg-surface-2"
              >
                {t("trading212.disconnectButton")}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
            <Landmark size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">{t("trading212.notConnected")}</p>
            <p className="text-xs text-ink-muted">{t("trading212.connectDescription")}</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-surface active:opacity-90"
          >
            {t("trading212.connectButton")}
          </button>
        </div>
      )}

      <Trading212ConnectModal open={modalOpen} onClose={() => setModalOpen(false)} onConnected={load} />
    </Card>
  );
}
