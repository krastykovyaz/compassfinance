"use client";

// Connect Trading 212 modal — collects the user's own API Key/API Secret
// (generated in the Trading 212 app under Settings > API (Beta), a real
// key+secret pair Trading 212 itself issues — never anything invented by
// this app) and submits them to the server for real validation. Never
// stores anything client-side: on success the server returns only
// status/timestamp metadata (see trading212-repository.ts's DTO), never
// the credentials themselves, and this component doesn't keep the typed
// values around after submit either way.

import { useState } from "react";
import { X, Loader2, TriangleAlert, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function Trading212ConnectModal({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    if (submitting) return; // don't allow closing mid-submit
    setApiKey("");
    setApiSecret("");
    setShowSecret(false);
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    if (!apiKey.trim() || !apiSecret.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/trading212", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? t("trading212.connectGenericError"));
        return;
      }
      setApiKey("");
      setApiSecret("");
      onConnected();
      onClose();
    } catch {
      setError(t("trading212.connectGenericError"));
    } finally {
      setSubmitting(false);
    }
  }

  const isValid = apiKey.trim().length > 0 && apiSecret.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label={t("general.close")}
        onClick={handleClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-[420px] rounded-t-[28px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-2" />

        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">{t("trading212.connectTitle")}</h2>
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

        <p className="mt-1 text-[13px] text-ink-muted">{t("trading212.connectExplainer")}</p>
        <p className="mt-2 text-[12px] leading-snug text-ink-faint">{t("trading212.connectReadOnlyNote")}</p>
        <p className="mt-2 text-[12px] leading-snug text-ink-faint">{t("trading212.connectWhereToFindKeys")}</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[13px] font-medium text-ink-muted" htmlFor="t212-api-key">
              {t("trading212.apiKeyLabel")}
            </label>
            <input
              id="t212-api-key"
              type="text"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-2xl bg-surface-2 px-4 py-3 text-[15px] text-ink outline-none disabled:opacity-60"
              placeholder={t("trading212.apiKeyPlaceholder")}
            />
          </div>
          <div>
            <label className="text-[13px] font-medium text-ink-muted" htmlFor="t212-api-secret">
              {t("trading212.apiSecretLabel")}
            </label>
            <div className="mt-1 flex items-center rounded-2xl bg-surface-2 pr-2">
              <input
                id="t212-api-secret"
                type={showSecret ? "text" : "password"}
                autoComplete="off"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                disabled={submitting}
                className="w-full bg-transparent px-4 py-3 text-[15px] text-ink outline-none disabled:opacity-60"
                placeholder={t("trading212.apiSecretPlaceholder")}
              />
              <button
                type="button"
                aria-label={showSecret ? t("trading212.hideSecret") : t("trading212.showSecret")}
                onClick={() => setShowSecret((s) => !s)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface"
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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
