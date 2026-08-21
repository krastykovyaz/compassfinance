"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function AuthErrorPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <h1 className="text-[20px] font-semibold text-ink">{t("auth.errorTitle")}</h1>
      <p className="text-[14px] leading-5 text-ink-muted">{t("auth.errorBody")}</p>
      <Link
        href="/signin"
        className="rounded-2xl bg-ink px-5 py-3 text-[14px] font-medium text-surface"
      >
        {t("auth.tryAgain")}
      </Link>
    </div>
  );
}
