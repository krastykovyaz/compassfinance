"use client";

// Connect Wallet modal — shown from both wallet-card.tsx (Profile) and
// hyperliquid-account-panel.tsx (Portfolio) instead of calling connect()
// directly. Always offers both transports (no device/UA detection): the
// injected-wallet option when one is present, and the WalletConnect
// QR/deep-link section when configured. That single presentation handles
// desktop-with-extension, desktop-without-extension (scan with phone),
// mobile Safari/Chrome (tap a deep link), and mobile wallets with their own
// in-app browser (which still exposes an injected provider) correctly.

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useWallet } from "@/lib/wallet/wallet-provider";
import { isWalletAvailable } from "@/lib/wallet/evm-wallet-provider";
import { getWalletDeepLink, WALLET_OPTIONS } from "@/lib/wallet/walletconnect-deep-links";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function WalletConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connect, connectWalletConnect, disconnect, walletConnectUri, isWalletConnectAvailable } =
    useWallet();
  const { t } = useTranslation();
  // Keyed by the URI it was generated for, so a stale QR from a previous
  // pairing attempt never renders alongside a newer walletConnectUri.
  const [qr, setQr] = useState<{ uri: string; svg: string } | null>(null);
  const injectedAvailable = isWalletAvailable();

  useEffect(() => {
    if (open && isWalletConnectAvailable) {
      connectWalletConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!walletConnectUri) return;
    let cancelled = false;
    import("qrcode").then((QRCode) =>
      QRCode.toString(walletConnectUri, { type: "svg", margin: 1 }).then((svg) => {
        if (!cancelled) setQr({ uri: walletConnectUri, svg });
      })
    );
    return () => {
      cancelled = true;
    };
  }, [walletConnectUri]);

  const qrSvg = qr && qr.uri === walletConnectUri ? qr.svg : null;

  if (!open) return null;

  function handleClose() {
    if (walletConnectUri !== null) disconnect(); // cancel a pending WalletConnect attempt
    onClose();
  }

  function handleInjectedConnect() {
    connect();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label={t("general.close")}
        onClick={handleClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-[420px] rounded-t-[28px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-2" />

        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">{t("wallet.connectWallet")}</h2>
          <button
            aria-label={t("general.close")}
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-[13px] text-ink-muted">{t("wallet.chooseConnectionMethod")}</p>

        {injectedAvailable ? (
          <button
            onClick={handleInjectedConnect}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90"
          >
            {t("wallet.browserExtension")}
          </button>
        ) : null}

        {isWalletConnectAvailable ? (
          <div className="mt-4 rounded-2xl border border-border p-4">
            <p className="text-center text-[13px] font-medium text-ink-muted">
              {t("wallet.scanWithPhone")}
            </p>
            <div className="mt-3 flex justify-center">
              {qrSvg ? (
                <div
                  className="h-44 w-44 [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-ink-faint" />
                </div>
              )}
            </div>

            <p className="mt-4 text-center text-[13px] font-medium text-ink-muted">
              {t("wallet.orContinueWith")}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {WALLET_OPTIONS.map((wallet) =>
                walletConnectUri ? (
                  <a
                    key={wallet.id}
                    href={getWalletDeepLink(wallet.id, walletConnectUri)}
                    onClick={onClose}
                    className="flex items-center justify-center rounded-xl bg-surface-2 px-3 py-2.5 text-center text-[13px] font-medium text-ink active:opacity-80"
                  >
                    {wallet.name}
                  </a>
                ) : (
                  <span
                    key={wallet.id}
                    className="flex items-center justify-center rounded-xl bg-surface-2 px-3 py-2.5 text-center text-[13px] font-medium text-ink-faint"
                  >
                    {wallet.name}
                  </span>
                )
              )}
            </div>
          </div>
        ) : null}

        {!injectedAvailable && !isWalletConnectAvailable ? (
          <p className="mt-4 text-center text-[13px] text-ink-muted">
            {t("wallet.walletConnectUnavailable")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
