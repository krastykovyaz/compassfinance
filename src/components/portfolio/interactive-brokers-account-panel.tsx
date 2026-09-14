"use client";

// Interactive Brokers account panel — Phase 2 built the compact summary →
// "View details" → positions list; Phase 3 adds a real activity/history
// section (orders/executions/dividends — never fees/deposits/withdrawals,
// which have no live IBKR source at all, see interactive-brokers-
// activity-repository.ts's own header comment) below the positions list,
// mirroring Trading212AccountPanel's own embedded activity section
// exactly (same ActivityList/Trading212ActivityFilterBar components).
//
// syncStatus/syncError reuse the exact same describeTrading212SyncState
// logic Trading212AccountPanel already uses — that function's own inputs
// (syncStatus/syncError/lastSyncAt/connectionStatus) are already fully
// provider-neutral, so IBKR reuses it directly rather than a second copy
// of the same staleness/failure-classification logic.

import { useState } from "react";
import Link from "next/link";
import { Landmark, Loader2, RefreshCw, TriangleAlert, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { useInteractiveBrokersPortfolio } from "@/lib/interactive-brokers/use-interactive-brokers-portfolio";
import { useInteractiveBrokersActivity } from "@/lib/interactive-brokers/use-interactive-brokers-activity";
import { ActivityList } from "@/components/portfolio/activity-list";
import { Trading212ActivityFilterBar, type Trading212ActivityFilter } from "@/components/portfolio/trading212-activity-filter-bar";
import { normalizeInteractiveBrokersPosition } from "@/lib/portfolio/portfolio-sources";
import { describeTrading212SyncState } from "@/lib/trading212/sync-state";
import { formatTrading212Currency } from "@/lib/trading212/currency";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn, formatRelativeTime } from "@/lib/utils";

const BENEFIT_KEYS = ["benefitPortfolioCash", "benefitPositions", "benefitReadOnly"] as const;

type InteractiveBrokersAccountCandidate = { accountId: string; accountTitle: string | null; accountAlias: string | null; type: string | null };

type SyncUiState =
  | { stage: "idle" }
  | { stage: "syncing" }
  | { stage: "success" }
  | { stage: "failed"; message: string }
  | { stage: "already_syncing" }
  | { stage: "needs_selection"; accounts: InteractiveBrokersAccountCandidate[] };

export function InteractiveBrokersAccountPanel() {
  const { t } = useTranslation();
  const state = useInteractiveBrokersPortfolio();
  const load = state.refresh;
  const [syncState, setSyncState] = useState<SyncUiState>({ stage: "idle" });
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<Trading212ActivityFilter>("all");
  const activityState = useInteractiveBrokersActivity({ kind: activityFilter, limit: 20 });

  async function handleSync() {
    setSyncState({ stage: "syncing" });
    try {
      const res = await fetch("/api/user/interactive-brokers/sync", { method: "POST", signal: AbortSignal.timeout(30_000) });
      const body = (await res.json().catch(() => null)) as
        | { status?: string; message?: string; error?: string; accounts?: InteractiveBrokersAccountCandidate[] }
        | null;
      if (!res.ok) {
        setSyncState({ stage: "failed", message: body?.error ?? t("interactiveBrokers.syncFailed") });
      } else if (body?.status === "already_syncing") {
        setSyncState({ stage: "already_syncing" });
      } else if (body?.status === "needs_account_selection") {
        setSyncState({ stage: "needs_selection", accounts: body.accounts ?? [] });
      } else if (body?.status === "failed") {
        setSyncState({ stage: "failed", message: body.message ?? t("interactiveBrokers.syncFailed") });
      } else {
        setSyncState({ stage: "success" });
      }
    } catch {
      setSyncState({ stage: "failed", message: t("interactiveBrokers.syncFailed") });
    } finally {
      load();
    }
  }

  async function handleSelectAccount() {
    if (!selectedCandidate) return;
    setSelecting(true);
    try {
      const res = await fetch("/api/user/interactive-brokers/select-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedCandidate }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        setSyncState({ stage: "failed", message: t("interactiveBrokers.chooseAccountError") });
        return;
      }
      setSelectedCandidate(null);
      await handleSync();
    } catch {
      setSyncState({ stage: "failed", message: t("interactiveBrokers.chooseAccountError") });
    } finally {
      setSelecting(false);
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

  if (!state.portfolio) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <IconCircle colorKey="slate">
            <Landmark size={18} />
          </IconCircle>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">{t("interactiveBrokers.cardTitle")}</p>
            <p className="text-xs text-ink-muted">{t("interactiveBrokers.notConnected")}</p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink-muted">{t("interactiveBrokers.connectPromptFull")}</p>
        <ul className="mt-3 space-y-1.5">
          {BENEFIT_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Check size={14} className="shrink-0 text-positive" />
              {t(`interactiveBrokers.${key}`)}
            </li>
          ))}
        </ul>
        <a
          href="/api/user/interactive-brokers/oauth/start"
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-medium text-surface active:opacity-90"
        >
          {t("interactiveBrokers.connectButtonFull")}
        </a>
        <button
          onClick={() => setLearnMoreOpen((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1 py-1.5 text-[12px] font-medium text-ink-muted"
        >
          {t("portfolio.learnMore")} {learnMoreOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {learnMoreOpen ? <p className="mt-1 text-[12px] text-ink-faint">{t("interactiveBrokers.benefitReadOnly")}</p> : null}
      </Card>
    );
  }

  const { accountId, account, positions, syncStatus, syncError, lastSyncAt, lastFailedSyncAt, connectionStatus } = state.portfolio;
  const syncView = describeTrading212SyncState({ syncStatus, syncError, lastSyncAt, connectionStatus });
  const syncInProgress = syncState.stage === "syncing" || syncState.stage === "already_syncing" || syncView.kind === "syncing";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconCircle colorKey="green">
            <Landmark size={18} />
          </IconCircle>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
              {t("interactiveBrokers.cardTitle")}
              <span className="rounded-full bg-positive-bg px-2 py-0.5 text-[11px] font-medium text-positive">
                {t("interactiveBrokers.connected")}
              </span>
            </p>
            <p className="text-xs text-ink-muted">{accountId ?? "—"}</p>
          </div>
        </div>
        <button
          aria-label={t("interactiveBrokers.syncButton")}
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
          <p className="text-[11px] text-ink-muted">{t("interactiveBrokers.positionsTitle")}</p>
          <p className="text-[13px] font-semibold text-ink">{positions.length}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-muted">{t("interactiveBrokers.lastSynced")}</p>
          <p className="text-[13px] font-semibold text-ink">
            {syncState.stage === "already_syncing"
              ? t("trading212.alreadySyncing")
              : lastSyncAt
                ? formatRelativeTime(lastSyncAt)
                : t("interactiveBrokers.neverSynced")}
          </p>
        </div>
      </div>

      {syncState.stage === "needs_selection" ? (
        <div className="mt-3 rounded-xl border border-border p-3">
          <p className="text-[13px] font-medium text-ink">{t("interactiveBrokers.chooseAccountTitle")}</p>
          <p className="mt-1 text-[12px] text-ink-muted">{t("interactiveBrokers.chooseAccountExplainer")}</p>
          <div className="mt-2 space-y-1.5">
            {syncState.accounts.map((candidate) => (
              <label
                key={candidate.accountId}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="ibkr-account-candidate"
                  checked={selectedCandidate === candidate.accountId}
                  onChange={() => setSelectedCandidate(candidate.accountId)}
                />
                {candidate.accountAlias ?? candidate.accountTitle ?? candidate.accountId}
                <span className="text-ink-faint">({candidate.accountId}{candidate.type ? ` · ${candidate.type}` : ""})</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => void handleSelectAccount()}
            disabled={!selectedCandidate || selecting}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-ink py-2 text-[13px] font-medium text-surface disabled:opacity-60"
          >
            {selecting ? <Loader2 size={13} className="animate-spin" /> : null}
            {t("interactiveBrokers.chooseAccountConfirm")}
          </button>
        </div>
      ) : null}

      {syncState.stage === "failed" ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{syncState.message}</span>
        </div>
      ) : syncState.stage === "already_syncing" ? (
        <p className="mt-3 text-xs font-medium text-ink-muted">{t("trading212.alreadySyncing")}</p>
      ) : syncState.stage === "success" ? (
        <p className="mt-3 text-xs font-medium text-positive">{t("interactiveBrokers.syncSuccess")}</p>
      ) : syncView.kind === "failed" ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {syncView.needsAttention ? t("interactiveBrokers.connectionNeedsAttention") : t("interactiveBrokers.syncFailed")}
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
        {expanded ? t("market.hideDetails") : t("interactiveBrokers.viewDetails")}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {!expanded ? null : (
        <>
          <h3 className="mt-4 text-[13px] font-medium text-ink-muted">{t("interactiveBrokers.positionsTitle")}</h3>
          {positions.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-muted">
              {syncView.kind === "never_synced" ? t("interactiveBrokers.syncPrompt") : t("interactiveBrokers.noPositions")}
            </p>
          ) : (
            <div className="mt-1 divide-y divide-border">
              {positions.map((p) => {
                const normalized = normalizeInteractiveBrokersPosition(p, lastSyncAt);
                const row = (
                  <div className="flex items-center gap-3 py-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
                      <Landmark size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{normalized.displayName}</p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {normalized.technicalTicker} · {normalized.quantity} {t("interactiveBrokers.quantity")}
                        {normalized.averagePrice != null
                          ? ` · ${t("interactiveBrokers.avgPrice")} ${formatTrading212Currency(normalized.averagePrice, normalized.currency)}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-medium text-ink">
                        {normalized.marketValue != null
                          ? formatTrading212Currency(normalized.marketValue, normalized.currency)
                          : t("interactiveBrokers.marketValueUnavailable")}
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
                  <Link key={p.externalId} href={`/asset/${normalized.compassAssetId}`} className="block active:bg-surface-2">
                    {row}
                  </Link>
                ) : (
                  <div key={p.externalId}>{row}</div>
                );
              })}
            </div>
          )}

          <h3 className="mt-4 text-[13px] font-medium text-ink-muted">{t("interactiveBrokers.activityHeading")}</h3>
          <div className="mt-2">
            <Trading212ActivityFilterBar value={activityFilter} onChange={setActivityFilter} includeAccountLevel={false} />
          </div>
          {activityState.stage === "loading" ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-ink-faint" />
            </div>
          ) : activityState.stage === "error" ? (
            <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{t("interactiveBrokers.activityLoadError")}</span>
            </div>
          ) : syncView.kind === "never_synced" ? (
            <p className="py-4 text-center text-[13px] text-ink-muted">{t("interactiveBrokers.syncPrompt")}</p>
          ) : (
            <>
              <ActivityList items={activityState.items} sourceLabel={t("interactiveBrokers.source")} emptyLabel={t("interactiveBrokers.noActivity")} />
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
