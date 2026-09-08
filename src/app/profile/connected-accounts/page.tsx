"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { WalletCard } from "@/components/profile/wallet-card";
import { Trading212Card } from "@/components/profile/trading212-card";
import { useTranslation } from "@/lib/i18n/locale-provider";

// Moved out of the main Settings page — the wallet and Trading 212
// connection cards used to render inline on Settings itself, but that
// meant every visitor saw two full "not connected" cards up front even
// if they'd never use either. Now they live behind the "Connected
// accounts" row (see profile/settings/page.tsx), same "summary row that
// expands to its own page" pattern as Trusted Sources — connecting still
// happens right here, just one tap deeper.
export default function ConnectedAccountsPage() {
  const { t } = useTranslation();

  return (
    <AppShell>
      <Header title={t("linkRows.connectedAccounts")} backHref="/profile/settings" />
      <div className="space-y-5 px-5">
        <WalletCard />
        <Trading212Card />
      </div>
    </AppShell>
  );
}
