"use client";

// Connect Interactive Brokers with a Flex report: the personal-account
// route. The user creates a Flex Query and a Flex Web Service token in their
// own Interactive Brokers Client Portal and pastes both here, the same
// pattern as the Trading 212 key and secret. Nothing is kept client-side:
// both values are cleared after every submit, and the server checks them
// with Interactive Brokers before it stores anything.

import { useState } from "react";
import { X, Loader2, TriangleAlert, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function InteractiveBrokersFlexConnectModal({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const { t } = useTranslation();
  const [token, setToken] = useState("");
  const [queryId, setQueryId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    if (submitting) return; // don't allow closing mid-submit
    setToken("");
    setQueryId("");
    setShowToken(false);
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    if (!token.trim() || !queryId.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/interactive-brokers/flex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), queryId: queryId.trim() }),
        signal: AbortSignal.timeout(25_000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? t("interactiveBrokers.flexConnectGenericError"));
        return;
      }
      setToken("");
      setQueryId("");
      onConnected();
      onClose();
    } catch {
      setError(t("interactiveBrokers.flexConnectGenericError"));
    } finally {
      setSubmitting(false);
    }
  }

  const isValid = token.trim().length > 0 && queryId.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button aria-label={t("general.close")} onClick={handleClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div className="relative max-h-[92dvh] w-full max-w-[420px] overflow-y-auto rounded-t-[28px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-2" />

        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">{t("interactiveBrokers.flexConnectTitle")}</h2>
          {!submitting ? (
            <button
              aria-label={t("general.close")}
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>

        <p className="mt-1 text-[13px] text-ink-muted">{t("interactiveBrokers.flexConnectExplainer")}</p>
        <p className="mt-2 text-[12px] leading-snug text-ink-faint">{t("interactiveBrokers.flexReadOnlyNote")}</p>
        <p className="mt-2 text-[12px] leading-snug text-ink-faint">{t("interactiveBrokers.flexWhereToFind")}</p>

        <details className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-[12px] leading-snug text-ink-muted">
          <summary className="cursor-pointer text-[13px] font-medium text-ink">{t("interactiveBrokers.flexHelpTitle")}</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            <li>{t("interactiveBrokers.flexHelpWebsite")}</li>
            <li>{t("interactiveBrokers.flexHelpQuery")}</li>
            <li>{t("interactiveBrokers.flexHelpPeriod")}</li>
            <li>{t("interactiveBrokers.flexHelpToken")}</li>
            <li>{t("interactiveBrokers.flexHelpIds")}</li>
          </ul>
        </details>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[13px] font-medium text-ink-muted" htmlFor="ibkr-flex-token">
              {t("interactiveBrokers.flexTokenLabel")}
            </label>
            <div className="mt-1 flex items-center rounded-2xl bg-surface-2 pr-2">
              <input
                id="ibkr-flex-token"
                type={showToken ? "text" : "password"}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={submitting}
                className="w-full bg-transparent px-4 py-3 text-[15px] text-ink outline-none disabled:opacity-60"
                placeholder={t("interactiveBrokers.flexTokenPlaceholder")}
              />
              <button
                type="button"
                aria-label={showToken ? t("interactiveBrokers.flexHideToken") : t("interactiveBrokers.flexShowToken")}
                onClick={() => setShowToken((s) => !s)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface"
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[13px] font-medium text-ink-muted" htmlFor="ibkr-flex-query-id">
              {t("interactiveBrokers.flexQueryIdLabel")}
            </label>
            <input
              id="ibkr-flex-query-id"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-2xl bg-surface-2 px-4 py-3 text-[15px] text-ink outline-none disabled:opacity-60"
              placeholder={t("interactiveBrokers.flexQueryIdPlaceholder")}
            />
          </div>
        </div>

        {error ? (
          <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2.5 text-xs text-negative">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          onClick={() => void handleSubmit()}
          disabled={!isValid || submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t("trading212.connecting")}
            </>
          ) : (
            t("trading212.connectButton")
          )}
        </button>
      </div>
    </div>
  );
}
