"use client";

import { useTranslation } from "@/lib/i18n/locale-provider";

export function SignInCopy() {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-[22px] font-semibold text-ink">{t("auth.welcomeTitle")}</h1>
      <p className="text-[14px] leading-5 text-ink-muted">{t("auth.welcomeSubtitle")}</p>
    </>
  );
}
