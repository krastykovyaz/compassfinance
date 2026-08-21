"use client";

import { ExternalLink, Link2, Waves } from "lucide-react";
import { DarkCard } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function HyperliquidPanel({
  accountLabel,
  network,
}: {
  accountLabel: string;
  network: string;
}) {
  const { t } = useTranslation();
  return (
    <DarkCard>
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-dark-ink">
          {t("portfolio.connectedToHyperliquid")}
        </p>
        <button className="flex items-center gap-1 text-[13px] font-medium text-blue-400">
          {t("portfolio.viewOnHyperliquid")} <ExternalLink size={13} />
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple/20 text-purple">
            <Link2 size={15} />
          </div>
          <div className="flex flex-1 items-center justify-between">
            <span className="text-[13px] text-dark-ink-muted">{t("portfolio.account")}</span>
            <span className="text-[13px] font-medium text-dark-ink">
              {accountLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue/20 text-blue-400">
            <Waves size={15} />
          </div>
          <div className="flex flex-1 items-center justify-between">
            <span className="text-[13px] text-dark-ink-muted">{t("portfolio.network")}</span>
            <span className="text-[13px] font-medium text-dark-ink">{network}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-dark-ink-muted">
        {t("portfolio.demoDataOnly")}
      </p>
    </DarkCard>
  );
}
