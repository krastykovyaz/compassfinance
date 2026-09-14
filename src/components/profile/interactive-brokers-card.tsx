"use client";

// Interactive Brokers connection card — Phase 1: connect (OAuth
// redirect)/disconnect only, no portfolio/sync UI at all (there is
// nothing to sync yet). Mirrors Trading212Card's not-connected/connected
// shape for a consistent "external connection" pattern on the Connected
// Accounts page, but the connect action itself is a real browser
// navigation to an OAuth start route (never a form/modal collecting a
// password) — IBKR's own login page is where the user authenticates, on
// IBKR's own domain.
//
// Status comes from GET /api/user/interactive-brokers, which only ever
// returns { status, lastConnectedAt } (see interactive-brokers-
// repository.ts's DTO) — this component never sees, requests, or could
// render an OAuth token, RSA key, or any other credential even by
// accident.

import { useEffect, useState } from "react";
import { Landmark, Loader2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useInteractiveBrokersConnection } from "@/lib/interactive-brokers/use-interactive-brokers-connection";

type OAuthBanner = { kind: "connected" } | { kind: "error"; reason: string };

/** Reads the one-time `ibkr=connected` / `ibkr=error&reason=...` query
 * params the OAuth callback route redirects back with, then strips them
 * from the URL so refreshing the page doesn't re-show the banner. Plain
 * browser APIs (not next/navigation's useSearchParams) so this needs no
 * Suspense boundary at the page level. */
function useOAuthCallbackBanner(onConnected: () => void): OAuthBanner | null {
  const [banner, setBanner] = useState<OAuthBanner | null>(null);

  useEffect(() => {
    // Deferred a tick — same reasoning as useTrading212Connection's own
    // setTimeout(load, 0): a one-time, mount-only read of window.location
    // whose result feeds setState, kept out of the effect's synchronous
    // body so it doesn't trigger a cascading render during commit.
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const ibkr = params.get("ibkr");
      if (ibkr === "connected") {
        setBanner({ kind: "connected" });
        onConnected();
      } else if (ibkr === "error") {
        setBanner({ kind: "error", reason: params.get("reason") ?? "unknown" });
      } else {
        return;
      }
      params.delete("ibkr");
      params.delete("reason");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    }, 0);
    return () => clearTimeout(timeout);
    // Only ever read once, right after the redirect lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return banner;
}

export function InteractiveBrokersCard() {
  const { t, locale } = useTranslation();
  const state = useInteractiveBrokersConnection();
  const load = state.refresh;
  const banner = useOAuthCallbackBanner(load);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/user/interactive-brokers", { method: "DELETE", signal: AbortSignal.timeout(10_000) });
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
      <p className="text-[13px] font-medium text-ink-muted">{t("interactiveBrokers.cardTitle")}</p>

      {banner?.kind === "error" ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{t("interactiveBrokers.connectErrorGeneric")}</span>
        </div>
      ) : null}

      {state.stage === "loading" ? (
        <div className="mt-2 flex items-center justify-center py-4">
          <Loader2 size={18} className="animate-spin text-ink-faint" />
        </div>
      ) : state.stage === "error" ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{t("interactiveBrokers.loadError")}</span>
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
                {t("interactiveBrokers.connected")}
              </p>
              <p className="text-xs text-ink-muted">
                {t("interactiveBrokers.lastConnected")}:{" "}
                {lastConnectedAt ? new Date(lastConnectedAt).toLocaleString(locale) : "—"}
              </p>
            </div>
          </div>

          {confirmingDisconnect ? (
            <div className="mt-3 rounded-xl bg-negative-bg px-3 py-2.5 text-xs text-negative">
              <p className="flex items-start gap-1.5">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>{t("interactiveBrokers.disconnectConfirm")}</span>
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
                  {t("interactiveBrokers.disconnectButton")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <button
                onClick={() => setConfirmingDisconnect(true)}
                className="w-full rounded-full border border-border py-2 text-[13px] font-medium text-ink hover:bg-surface-2"
              >
                {t("interactiveBrokers.disconnectButton")}
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
            <p className="text-[14px] font-medium text-ink">{t("interactiveBrokers.notConnected")}</p>
            <p className="text-xs text-ink-muted">{t("interactiveBrokers.connectDescription")}</p>
          </div>
          <a
            href="/api/user/interactive-brokers/oauth/start"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-surface active:opacity-90"
          >
            {t("interactiveBrokers.connectButton")}
          </a>
        </div>
      )}
    </Card>
  );
}
