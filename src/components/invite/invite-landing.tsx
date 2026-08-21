"use client";

import { Compass as CompassIcon } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function InviteLanding({ valid }: { valid: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-8 bg-canvas px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-surface">
          <CompassIcon size={28} />
        </div>
        <h1 className="text-[22px] font-semibold text-ink">
          {valid ? t("invite.title") : t("invite.invalidTitle")}
        </h1>
        <p className="text-[14px] leading-5 text-ink-muted">
          {valid ? t("invite.subtitle") : t("invite.invalidSubtitle")}
        </p>
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
