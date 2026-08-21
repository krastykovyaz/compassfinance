"use client";

import { useState } from "react";
import { Wallet, Loader2, TriangleAlert, ExternalLink } from "lucide-react";
import { useSession } from "next-auth/react";
import { DarkCard } from "@/components/ui/card";
import { useWallet } from "@/lib/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { useHyperliquidAccount, HyperliquidAccountStatus } from "@/lib/hyperliquid/hyperliquid-account-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { formatCurrency, cn } from "@/lib/utils";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function Skeleton() {
  return (
    <div className="mt-3 space-y-2">
      <div className="h-5 w-1/2 animate-pulse rounded bg-dark-card-2" />
      <div className="h-16 w-full animate-pulse rounded-xl bg-dark-card-2" />
    </div>
  );
}

export type HyperliquidPanelView =
  | "not-connected"
  | "hyperliquid-disabled"
  | "sign-in-required"
  | "loading"
  | "error"
  | "content";

// Pure "which branch should this panel render" decision, pulled out of the
// component so it's directly testable without a renderer (this repo's test
// setup has no jsdom/@testing-library). Also the fix for a real bug: the
// component used to treat useHyperliquidAccount()'s "disconnected" status
// as loading, always — but "disconnected" is also the status while the
// wallet IS connected and the user just isn't signed in (Hyperliquid
// account data requires an authenticated session), which never resolves to
// anything else. That produced an infinite-looking skeleton for a guest
// with a connected wallet, instead of a real "sign in" message.
export function resolveHyperliquidPanelView(params: {
  walletStatus: string;
  address: string | null;
  sessionStatus: string;
  accountStatus: HyperliquidAccountStatus;
  errorMessage: string | null;
}): HyperliquidPanelView {
  const { walletStatus, address, sessionStatus, accountStatus, errorMessage } = params;
  if (walletStatus !== "connected" || !address) return "not-connected";
  if (accountStatus === "unavailable" && errorMessage === "disabled") return "hyperliquid-disabled";
  if (accountStatus === "disconnected" && sessionStatus !== "authenticated") return "sign-in-required";
  if (accountStatus === "loading" || accountStatus === "disconnected") return "loading";
  if (accountStatus === "error" || accountStatus === "unavailable") return "error";
  return "content";
}

export function HyperliquidAccountPanel() {
  const { t } = useTranslation();
  const { status: sessionStatus } = useSession();
  const { status: walletStatus, address, isConnecting, isUnsupportedChain } = useWallet();
  const { snapshot, openOrders, fills, status: accountStatus, errorMessage, refresh } = useHyperliquidAccount();
  const [modalOpen, setModalOpen] = useState(false);

  const view = resolveHyperliquidPanelView({ walletStatus, address, sessionStatus, accountStatus, errorMessage });

  // Not connected — the wallet layer is generic EVM and works regardless
  // of the Hyperliquid flag, so this state is always the same real
  // disconnected UI, never a fake balance.
  if (view === "not-connected") {
    return (
      <DarkCard>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dark-card-2 text-dark-ink-muted">
            <Wallet size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-dark-ink">{t("hyperliquidAccount.notConnected")}</p>
            <p className="text-xs text-dark-ink-muted">{t("hyperliquidAccount.connectPrompt")}</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            disabled={isConnecting}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue px-4 py-2 text-[13px] font-medium text-white active:opacity-90 disabled:opacity-60"
          >
            {isConnecting ? <Loader2 size={14} className="animate-spin" /> : t("wallet.connectWallet")}
          </button>
        </div>
        <WalletConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </DarkCard>
    );
  }

  // From here on the wallet IS connected, so `address` is guaranteed non-null.
  const connectedAddress = address as string;

  // Hyperliquid feature disabled — the wallet itself IS connected (shown
  // truthfully above the fold), only the Hyperliquid-specific data is
  // unavailable.
  if (view === "hyperliquid-disabled") {
    return (
      <DarkCard>
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold text-dark-ink">{shortAddress(connectedAddress)}</p>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-dark-ink-muted">
          <TriangleAlert size={14} />
          <p className="text-[13px]">{t("hyperliquidAccount.dataUnavailable")}</p>
        </div>
      </DarkCard>
    );
  }

  // Wallet connected but not signed in — Hyperliquid account data requires
  // an authenticated session, and this state never resolves on its own, so
  // it needs its own message rather than sitting under the loading skeleton.
  if (view === "sign-in-required") {
    return (
      <DarkCard>
        <p className="text-[14px] font-semibold text-dark-ink">{shortAddress(connectedAddress)}</p>
        <div className="mt-3 flex items-center gap-1.5 text-dark-ink-muted">
          <TriangleAlert size={14} />
          <p className="text-[13px]">{t("hyperliquidAccount.signInRequired")}</p>
        </div>
      </DarkCard>
    );
  }

  if (view === "loading") {
    return (
      <DarkCard>
        <p className="text-[14px] font-semibold text-dark-ink">{shortAddress(connectedAddress)}</p>
        <Skeleton />
      </DarkCard>
    );
  }

  if (view === "error") {
    return (
      <DarkCard>
        <p className="text-[14px] font-semibold text-dark-ink">{shortAddress(connectedAddress)}</p>
        <div className="mt-3 flex items-center gap-1.5 text-dark-ink-muted">
          <TriangleAlert size={14} />
          <p className="text-[13px]">{errorMessage ?? t("hyperliquidAccount.dataUnavailable")}</p>
        </div>
        <button
          onClick={() => refresh()}
          className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-blue-400"
        >
          {t("general.retry")}
        </button>
      </DarkCard>
    );
  }

  // "empty" or "ok" — snapshot is guaranteed non-null for both once we're past "loading"/"disconnected"/"unavailable"/"error".
  if (!snapshot) return null;

  return (
    <DarkCard>
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-dark-ink">{shortAddress(connectedAddress)}</p>
        <a
          href={`https://app.hyperliquid.xyz/portfolio`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[13px] font-medium text-blue-400"
        >
          {t("hyperliquidAccount.viewOnHyperliquid")} <ExternalLink size={13} />
        </a>
      </div>

      {/* Informational only — Hyperliquid account data is address-only
          and chain-agnostic, so an unsupported EVM chain in the connected
          wallet never gates or hides anything below this note. */}
      {isUnsupportedChain ? (
        <p className="mt-1.5 text-[11px] text-dark-ink-muted">{t("wallet.unsupportedNetwork")}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-dark-ink-muted">{t("hyperliquidAccount.availableBalance")}</p>
          <p className="text-[16px] font-semibold text-dark-ink">{formatCurrency(snapshot.withdrawableBalance)}</p>
        </div>
        <div>
          <p className="text-[11px] text-dark-ink-muted">{t("hyperliquidAccount.accountValue")}</p>
          <p className="text-[16px] font-semibold text-dark-ink">{formatCurrency(snapshot.accountValue)}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[13px] font-medium text-dark-ink">{t("hyperliquidAccount.positions")}</p>
        {snapshot.positions.length === 0 ? (
          <p className="mt-1 text-[12px] text-dark-ink-muted">{t("hyperliquidAccount.noPositions")}</p>
        ) : (
          <div className="mt-1.5 space-y-2">
            {snapshot.positions.map((p) => {
              const positive = p.unrealizedPnl >= 0;
              return (
                <div key={p.coin} className="rounded-xl bg-dark-card-2 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-dark-ink">
                      {p.coin} · {p.leverage}x
                    </span>
                    <span className={cn("text-[13px] font-medium", positive ? "text-positive" : "text-negative")}>
                      {formatCurrency(p.unrealizedPnl)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-dark-ink-muted">
                    <span>
                      {t("hyperliquidAccount.entryPrice")}: {p.entryPrice !== null ? formatCurrency(p.entryPrice) : "—"}
                    </span>
                    <span>
                      {t("hyperliquidAccount.liquidationPrice")}:{" "}
                      {p.liquidationPrice !== null ? formatCurrency(p.liquidationPrice) : "N/A"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[13px] font-medium text-dark-ink">{t("hyperliquidAccount.openOrders")}</p>
        {openOrders.length === 0 ? (
          <p className="mt-1 text-[12px] text-dark-ink-muted">{t("hyperliquidAccount.noOpenOrders")}</p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {openOrders.map((o) => (
              <div key={o.orderId} className="flex items-center justify-between text-[12px] text-dark-ink-muted">
                <span>
                  {o.side} {o.coin}
                </span>
                <span>
                  {o.size} @ {formatCurrency(o.price)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[13px] font-medium text-dark-ink">{t("hyperliquidAccount.recentFills")}</p>
        {fills.length === 0 ? (
          <p className="mt-1 text-[12px] text-dark-ink-muted">{t("hyperliquidAccount.noRecentFills")}</p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {fills.slice(0, 5).map((f, i) => (
              <div key={`${f.coin}-${f.timestamp}-${i}`} className="flex items-center justify-between text-[12px] text-dark-ink-muted">
                <span>
                  {f.side} {f.coin}
                </span>
                <span>
                  {f.size} @ {formatCurrency(f.price)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </DarkCard>
  );
}
