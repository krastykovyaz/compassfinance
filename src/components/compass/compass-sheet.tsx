"use client";

import { useState } from "react";
import { X, ArrowUp } from "lucide-react";
import { useCompassUi } from "@/lib/compass/compass-provider";
import { useCompassChat } from "@/lib/compass/use-compass-chat";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { buildContextLabelParts } from "@/lib/compass/context-label";
import { getSuggestedQuestionKeys } from "@/lib/compass/suggested-questions";
import { CompassBlockRenderer } from "./compass-block-renderer";

// The Compass bottom sheet (Phase 4, Section 28) — a fixed-inset-0 /
// backdrop / rounded-t-[28px] sheet, matching the pattern the rest of the
// app already uses for its own bottom sheets, so this feels native
// rather than a bolted-on chat widget.
export function CompassSheet() {
  const { isOpen, close, context } = useCompassUi();
  const { t, locale } = useTranslation();
  const chat = useCompassChat(context, locale);
  const [draft, setDraft] = useState("");

  if (!isOpen) return null;

  const labelParts = buildContextLabelParts(context);
  const badgeText = [t(labelParts.prefixKey), labelParts.suffixKey ? t(labelParts.suffixKey) : labelParts.suffixText].filter(Boolean).join(" · ");

  const hasMessages = chat.messages.length > 0;
  const suggestions = getSuggestedQuestionKeys(context.type).map((key) => t(key));
  const isSending = chat.status === "sending";

  function submit(text: string) {
    if (!text.trim() || isSending) return;
    chat.sendMessage(text);
    setDraft("");
  }

  function handleClose() {
    close();
    chat.reset();
    setDraft("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button aria-label={t("general.close")} onClick={handleClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div className="relative flex max-h-[85dvh] w-full max-w-[420px] flex-col rounded-t-[28px] bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl">
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-surface-2" />

        <div className="flex shrink-0 items-center justify-between px-5 pt-3">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">{t("compass.title")}</h2>
            <p className="text-[11px] font-medium text-purple">{badgeText}</p>
          </div>
          <button aria-label={t("general.close")} onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 flex-1 space-y-3 overflow-y-auto px-5 pb-2">
          {!hasMessages ? <p className="text-xs text-ink-faint">{t("compass.tagline")}</p> : null}

          {chat.messages.map((message) => (
            <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={message.role === "user" ? "max-w-[85%] rounded-2xl bg-purple px-3.5 py-2.5 text-[13px] text-white" : "max-w-[92%] space-y-2"}>
                {message.role === "assistant" ? (
                  <>
                    <p className="text-[13px] leading-relaxed text-ink">{message.content}</p>
                    {message.blocks.map((block, i) => (
                      <CompassBlockRenderer key={i} block={block} />
                    ))}
                  </>
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}

          {isSending ? <p className="text-xs text-ink-faint">{t("compass.thinking")}</p> : null}

          {chat.status === "error" ? (
            <p className="rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
              {chat.errorReason === "rate_limited" ? t("compass.errorRateLimited") : chat.errorReason === "invalid_message" ? t("compass.errorGeneric") : t("compass.errorUnavailable")}
            </p>
          ) : null}

          {!isSending && (!hasMessages || chat.suggestedFollowUps.length > 0) ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {(hasMessages ? chat.suggestedFollowUps : suggestions).map((question) => (
                <button
                  key={question}
                  onClick={() => submit(question)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:bg-surface-2"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit(draft);
            }}
            placeholder={t("compass.inputPlaceholder")}
            disabled={isSending}
            className="flex-1 rounded-full bg-surface-2 px-4 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
          />
          <button
            aria-label={t("compass.send")}
            onClick={() => submit(draft)}
            disabled={isSending || !draft.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple text-white disabled:opacity-40"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
