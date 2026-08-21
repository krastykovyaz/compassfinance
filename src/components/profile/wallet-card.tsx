"use client";

import { Wallet, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useWallet } from "@/lib/wallet/wallet-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletCard() {
  const {
    status,
    address,
    chainName,
    isUnsupportedChain,
    usdcBalance,
    isConnecting,
    isBalanceLoading,
    error,
    connect,
    disconnect,
    refreshBalance,
  } = useWallet();
  const { t } = useTranslation();

  if (status !== "connected") {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-ink-muted">
            {t("wallet.connected")} {t("wallet.usdcLabel")}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
            <Wallet size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">
              {isConnecting ? t("wallet.connecting") : t("wallet.noWalletConnected")}
            </p>
            <p className="text-xs text-ink-muted">
              {isConnecting
                ? t("wallet.checkWalletRequest")
                : t("wallet.connectWalletDescription")}
            </p>
          </div>
          <button
            onClick={connect}
            disabled={isConnecting}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-surface active:opacity-90 disabled:opacity-60"
          >
            {isConnecting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t("wallet.connecting")}
              </>
            ) : (
              t("wallet.connectWallet")
            )}
          </button>
        </div>
        {error ? (
          <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{error.message}</span>
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-muted">
          {t("wallet.connected")} {t("wallet.usdcLabel")}
        </p>
        <button onClick={disconnect} className="text-[13px] font-medium text-blue">
          {t("wallet.disconnect")}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-600">
          <Wallet size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">
            {address ? shortAddress(address) : "—"}
          </p>
          <p className="text-xs text-ink-muted">{chainName ?? t("wallet.unknownNetwork")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isUnsupportedChain ? (
            <p className="text-[13px] text-ink-muted">{t("wallet.unsupportedNetwork")}</p>
          ) : isBalanceLoading ? (
            <Loader2 size={14} className="animate-spin text-ink-faint" />
          ) : usdcBalance !== null ? (
            <p className="text-[14px] font-medium text-ink">
              {usdcBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC
            </p>
          ) : (
            <p className="text-[13px] text-ink-muted">{t("wallet.balanceUnavailable")}</p>
          )}
          <button
            onClick={refreshBalance}
            aria-label={t("wallet.refreshBalance")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      {isUnsupportedChain ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{t("wallet.unsupportedNetworkDescription")}</span>
        </div>
      ) : error && error.type === "balance-error" ? (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-negative-bg px-3 py-2 text-xs text-negative">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{error.message}</span>
        </div>
      ) : null}
    </Card>
  );
}
