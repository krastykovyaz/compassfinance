"use client";

import { useState } from "react";
import Link from "next/link";
import { Landmark, Loader2, RefreshCw, TriangleAlert, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { useTrading212Portfolio } from "@/lib/trading212/use-trading212-portfolio";
import { useTrading212Activity } from "@/lib/trading212/use-trading212-activity";
import { Trading212ActivityList } from "@/components/portfolio/trading212-activity-list";
import { Trading212ActivityFilterBar, type Trading212ActivityFilter } from "@/components/portfolio/trading212-activity-filter-bar";
import { Trading212ConnectModal } from "@/components/profile/trading212-connect-modal";
import { normalizeTrading212Position } from "@/lib/portfolio/portfolio-sources";
import { describeTrading212SyncState } from "@/lib/trading212/sync-state";
import { formatTrading212Currency } from "@/lib/trading212/currency";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn, formatRelativeTime } from "@/lib/utils";

const BENEFIT_KEYS = ["benefitPortfolioCash", "benefitOrdersDividends", "benefitAutoSync"] as const;

// Requirement 7 (Phase 3): shows the Trading 212 account CLEARLY labeled
// as its own source, never merged into paper holdings or the Hyperliquid
// panel. Phase (real-portfolios redesign): now shows a real connect CTA
// when there's no connection at all (previously rendered nothing here),
// and a compact summary by default when connected — the full positions/
// activity detail is one tap away via "View details", never lost.
export function Trading212AccountPanel() {
  const { t } = useTranslation();
  const state = useTrading212Portfolio();
  const [activityFilter, setActivityFilter] = useState<Trading212ActivityFilter>("all");
  const activityState = useTrading212Activity({ kind: activityFilter, limit: 20 });
  const [syncing, setSyncing] = useState(false);
  // A brief, purely-local "Sync complete" flash right after a successful
  // click — the persisted syncStatus (via syncView below) already covers
  // "never synced"/"syncing"/"failed" durably, but has no distinct
  // "just finished" moment of its own (it settles straight into
  // "synced", indistinguishable from a sync that finished five minutes
  // ago). Cleared on the next sync click or unmount.
  const [justSynced, setJustSynced] = useState(false);
  const [alreadySyncingFlash, setAlreadySyncingFlash] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleSync() {
    setSyncing(true);
    setJustSynced(false);
    setAlreadySyncingFlash(false);
    try {
      const res = await fetch("/api/user/trading212/sync", { method: "POST", signal: AbortSignal.timeout(30_000) });
      const body = (await res.json().catch(() => null)) as { status?: string } | null;
      if (res.ok && body?.status === "synced") setJustSynced(true);
      if (res.ok && body?.status === "already_syncing") setAlreadySyncingFlash(true);
    } catch {
      // Swallowed — refresh() below re-reads the connection's own
      // syncStatus/syncError either way, which is the one source of
      // truth this panel displays (see Trading212Card for the same
      // pattern on the Settings page).
    } finally {
      setSyncing(false);
      state.refresh();
    }
  }

  if (state.stage === "loading") {
    return (
      <Card>
        <div className="h-5 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="mt-3 h-16 w-full animate-pulse rounded-xl bg-surface-2" />
      </Card>
    );
  }

  if (state.stage === "error") return null;

  // Not connected — a real, working connect CTA right here on Portfolio
  // (Requirement: "not connected" cards live in the Real Portfolios
  // section, not just tucked away in Settings). Connecting here uses the
  // exact same modal/validation/storage path as Settings — no second
  // connect flow.
  if (!state.portfolio) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <IconCircle colorKey="slate">
            <Landmark size={18} />
          </IconCircle>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">{t("trading212.cardTitle")}</p>
            <p className="text-xs text-ink-muted">{t("trading212.notConnected")}</p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink-muted">{t("trading212.connectPromptFull")}</p>
        <ul className="mt-3 space-y-1.5">
          {BENEFIT_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Check size={14} className="shrink-0 text-positive" />
              {t(`trading212.${key}`)}
            </li>
          ))}
        </ul>
        <button
          onClick={() => setConnectModalOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-medium text-surface active:opacity-90"
        >
          {t("trading212.connectButtonFull")}
        </button>
        <button
          onClick={() => setLearnMoreOpen((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1 py-1.5 text-[12px] font-medium text-ink-muted"
        >
          {t("portfolio.learnMore")} {learnMoreOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {learnMoreOpen ? (
          <p className="mt-1 text-[12px] text-ink-faint">{t("trading212.connectReadOnlyNote")}</p>
        ) : null}
        <Trading212ConnectModal open={connectModalOpen} onClose={() => setConnectModalOpen(false)} onConnected={state.refresh} />
      </Card>
    );
  }

  const { accountId, account, positions, syncStatus, syncError, lastSyncAt, lastFailedSyncAt, connectionStatus } = state.portfolio;
  const syncView = describeTrading212SyncState({ syncStatus, syncError, lastSyncAt, connectionStatus });
  const syncInProgress = syncing || syncView.kind === "syncing";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconCircle colorKey="green">
            <Landmark size={18} />
          </IconCircle>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
              {t("trading212.cardTitle")}
              <span className="rounded-full bg-positive-bg px-2 py-0.5 text-[11px] font-medium text-positive">
                {t("trading212.connected")}
              </span>
            </p>
            <p className="text-xs text-ink-muted">{accountId}</p>
          </div>
        </div>
        <button
          aria-label={t("trading212.syncButton")}
          onClick={() => void handleSync()}
          disabled={syncInProgress}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2 disabled:opacity-60"
        >
          {syncInProgress ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {account?.totalValue != null ? (
        <p className="mt-3 text-[24px] font-semibold tracking-tight text-ink">
          {formatTrading212Currency(account.totalValue, account.currencyCode)}
        </p>
      ) : null}
      {account?.unrealizedPnl != null ? (
        <span className={cn("text-[13px] font-medium", account.unrealizedPnl >= 0 ? "text-positive" : "text-negative")}>
          {account.unrealizedPnl >= 0 ? "+" : ""}
          {formatTrading212Currency(account.unrealizedPnl, account.currencyCode)}
        </span>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] text-ink-muted">{t("trading212.cash")}</p>
          <p className="text-[13px] font-semibold text-ink">
            {account?.cashAvailable != null ? formatTrading212Currency(account.cashAvailable, account.currencyCode) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-ink-muted">{t("trading212.positionsTitle")}</p>
          <p className="text-[13px] font-semibold text-ink">{positions.length}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-muted">{t("trading212.lastSynced")}</p>
          <p className="text-[13px] font-semibold text-ink">
            {alreadySyncingFlash
              ? t("trading212.alreadySyncing")
              : lastSyncAt
                ? formatRelativeTime(lastSyncAt)
                : t("trading212.neverSynced")}
          </p>
        </div>
      </div>

      {justSynced ? <p className="mt-2 text-[11px] font-medium text-positive">{t("trading212.syncSuccess")}</p> : null}
      {syncView.kind === "synced" && syncView.staleness === "very_stale" ? (
        <p className="mt-2 text-[11px] font-medium text-ink-muted">{t("trading212.dataMayBeOutdated")}</p>
      ) : null}
      {syncView.kind === "failed" ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {syncView.needsAttention ? t("trading212.connectionNeedsAttention") : t("trading212.syncFailed")}
            {syncView.message ? ` — ${syncView.message}` : ""}
          </span>
        </div>
      ) : null}
      {lastFailedSyncAt && syncView.kind !== "failed" ? (
        <p className="mt-1 text-[11px] text-ink-muted">
          {t("trading212.lastFailedSync")}: {formatRelativeTime(lastFailedSyncAt)}
        </p>
      ) : null}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-full border border-border py-2 text-[13px] font-medium text-ink hover:bg-surface-2"
      >
        {expanded ? t("market.hideDetails") : t("trading212.viewDetails")}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {!expanded ? null : (
        <>
          <h3 className="mt-4 text-[13px] font-medium text-ink-muted">{t("trading212.positionsTitle")}</h3>
          {positions.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-muted">
              {syncView.kind === "never_synced" ? t("trading212.syncPrompt") : t("trading212.noPositions")}
            </p>
          ) : (
            <div className="mt-1 divide-y divide-border">
              {positions.map((p) => {
                const normalized = normalizeTrading212Position(p, lastSyncAt);
                const row = (
                  <div className="flex items-center gap-3 py-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
                      <Landmark size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{normalized.displayName}</p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {normalized.technicalTicker} · {normalized.quantity} {t("trading212.quantity")}
                        {normalized.averagePrice != null
                          ? ` · ${t("trading212.avgPrice")} ${formatTrading212Currency(normalized.averagePrice, normalized.currency)}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-medium text-ink">
                        {normalized.marketValue != null
                          ? formatTrading212Currency(normalized.marketValue, normalized.currency)
                          : t("trading212.marketValueUnavailable")}
                      </p>
                      {normalized.unrealizedPnl != null ? (
                        <p
                          className={cn(
                            "text-[11px] font-medium",
                            normalized.unrealizedPnl >= 0 ? "text-positive" : "text-negative"
                          )}
                        >
                          {normalized.unrealizedPnl >= 0 ? "+" : ""}
                          {formatTrading212Currency(normalized.unrealizedPnl, normalized.currency)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
                return normalized.compassAssetId ? (
                  <Link key={p.externalTicker} href={`/asset/${normalized.compassAssetId}`} className="block active:bg-surface-2">
                    {row}
                  </Link>
                ) : (
                  <div key={p.externalTicker}>{row}</div>
                );
              })}
            </div>
          )}

          <h3 className="mt-4 text-[13px] font-medium text-ink-muted">{t("trading212.activityHeading")}</h3>
          <div className="mt-2">
            <Trading212ActivityFilterBar value={activityFilter} onChange={setActivityFilter} />
          </div>
          {activityState.stage === "loading" ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-ink-faint" />
            </div>
          ) : activityState.stage === "error" ? (
            <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{t("trading212.activityLoadError")}</span>
            </div>
          ) : syncView.kind === "never_synced" ? (
            <p className="py-4 text-center text-[13px] text-ink-muted">{t("trading212.activitySyncPrompt")}</p>
          ) : (
            <>
              <Trading212ActivityList items={activityState.items} />
              {activityState.nextCursor ? (
                <button
                  onClick={() => void activityState.loadMore()}
                  disabled={activityState.loadingMore}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-border py-2 text-[13px] font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
                >
                  {activityState.loadingMore ? <Loader2 size={13} className="animate-spin" /> : null}
                  {activityState.loadingMore ? t("trading212.loadingMore") : t("trading212.loadMore")}
                </button>
              ) : null}
            </>
          )}
        </>
      )}
    </Card>
  );
}
