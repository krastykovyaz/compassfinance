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

import { useEffect, useState } from "react";
import { Landmark, Loader2, TriangleAlert, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { Trading212ConnectModal } from "./trading212-connect-modal";

type ConnectionDTO = {
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
};

type LoadState = { stage: "loading" } | { stage: "loaded"; connection: ConnectionDTO | null } | { stage: "error" };

export function Trading212Card() {
  const { t, locale } = useTranslation();
  const [state, setState] = useState<LoadState>({ stage: "loading" });
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/user/trading212", { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        setState({ stage: "error" });
        return;
      }
      const body = (await res.json()) as { connection: ConnectionDTO | null };
      setState({ stage: "loaded", connection: body.connection });
    } catch {
      setState({ stage: "error" });
    }
  }

  useEffect(() => {
    // Deferred out of the effect body proper — same pattern used
    // elsewhere in this app (e.g. hyperliquid-account-provider.tsx) so
    // the initial setState doesn't happen synchronously during the
    // effect phase itself.
    const kickoff = setTimeout(load, 0);
    return () => clearTimeout(kickoff);
  }, []);

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

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-muted">{t("trading212.cardTitle")}</p>
        {state.stage === "loaded" ? (
          <button
            aria-label={t("trading212.refresh")}
            onClick={() => {
              setState({ stage: "loading" });
              load();
            }}
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
            </div>
          </div>

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
                disabled
                title={t("trading212.syncNotAvailableYet")}
                className="flex-1 rounded-full border border-border py-2 text-[13px] font-medium text-ink-faint opacity-60"
              >
                {t("trading212.syncButton")}
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
