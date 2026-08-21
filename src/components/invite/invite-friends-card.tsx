"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useReferral } from "@/lib/referrals/use-referral";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function InviteFriendsCard() {
  const { t } = useTranslation();
  const { referral, isLoading, error, isSignedIn } = useReferral();
  const [copied, setCopied] = useState(false);

  if (!isSignedIn) {
    return (
      <Card>
        <p className="text-[13px] text-ink-faint">{t("invite.signInToInvite")}</p>
      </Card>
    );
  }

  const shareText = `${t("invite.title")} — ${t("invite.subtitle")}`;

  async function handleCopy() {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the
      // link is still visible/selectable on the page as a fallback.
    }
  }

  async function handleShare() {
    if (!referral) return;
    // Native Web Share API where available — on mobile this already
    // surfaces Telegram (and everything else installed) as a share
    // target, so it covers "share via Telegram" without a dedicated
    // third button. Where Web Share isn't available (most desktop
    // browsers), fall back to Telegram's own web share endpoint rather
    // than silently copying, so the Telegram path stays real either way.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "CompassFinance", text: shareText, url: referral.url });
        return;
      } catch {
        // User cancelled the share sheet, or share failed — fall through.
      }
    }
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
      referral.url
    )}&text=${encodeURIComponent(shareText)}`;
    window.open(telegramUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <p className="text-[15px] font-semibold text-ink">{t("invite.shareTitle")}</p>
      <p className="mt-1 text-[13px] text-ink-muted">{t("invite.shareSubtitle")}</p>

      {isLoading ? (
        <div className="mt-3 h-11 w-full animate-pulse rounded-xl bg-surface-2" />
      ) : error || !referral ? (
        <p className="mt-3 text-[13px] text-negative">{error ?? "Couldn't load your invite link."}</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
            <p className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{referral.url}</p>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={t("invite.copyLink")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface active:opacity-80"
            >
              {copied ? <Check size={16} className="text-positive" /> : <Copy size={16} />}
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label={t("invite.share")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface active:opacity-80"
            >
              <Share2 size={16} />
            </button>
          </div>

          {referral.referralCount > 0 ? (
            <p className="mt-3 text-center text-[12px] text-ink-muted">
              {referral.referralCount} {t("invite.friendsJoined")}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
