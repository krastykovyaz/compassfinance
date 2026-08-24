"use client";

import { Compass as CompassIcon, PartyPopper } from "lucide-react";
import Link from "next/link";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";
import { PublicShare } from "@/server/services/achievement-sharing-service";

// Rendered in the SHARER's account language (passed down from the Server
// Component page), not the visitor's own browser/localStorage locale —
// intentionally NOT useTranslation() here. Whoever opens a shared link
// should see it exactly as the person who shared it would have.
export function ShareLanding({ share, locale }: { share: PublicShare | null; locale: Locale }) {
  const t = (key: string) => translate(locale, key);

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-8 bg-canvas px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-surface">
          {share ? <PartyPopper size={26} /> : <CompassIcon size={28} />}
        </div>
        {share ? (
          <>
            <h1 className="text-[20px] font-semibold text-ink">
              {share.sharerName} {t("achievementShare.unlockedMessage")}{" "}
              {share.assetName ?? share.achievementTitle}
            </h1>
            <p className="text-[14px] leading-5 text-ink-muted">
              {t("invite.subtitle")}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[22px] font-semibold text-ink">
              {t("achievementShare.invalidTitle")}
            </h1>
            <p className="text-[14px] leading-5 text-ink-muted">
              {t("achievementShare.invalidSubtitle")}
            </p>
          </>
        )}
      </div>

      <Link
        href="/signin"
        className="mx-auto flex w-full max-w-xs items-center justify-center rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
      >
        {t("invite.getStarted")}
      </Link>
    </div>
  );
}
