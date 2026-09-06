import type { Metadata } from "next";
import "./globals.css";
import { ProgressProvider } from "@/lib/progress-store";
import { WalletProvider } from "@/lib/wallet/wallet-provider";
import { WalletLinkSync } from "@/lib/wallet/wallet-link-sync";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { NavigationHistoryProvider } from "@/lib/navigation/navigation-history-provider";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { FavoritesProvider } from "@/lib/favorites/favorites-provider";
import { NotificationsProvider } from "@/lib/notifications/notifications-provider";
import { PaperAccountProvider } from "@/lib/trading/paper-account-provider";
import { HyperliquidAccountProvider } from "@/lib/hyperliquid/hyperliquid-account-provider";
import { HyperliquidAgentProvider } from "@/lib/hyperliquid/hyperliquid-agent-provider";
import { ChunkReloadGuard } from "@/components/chunk-reload-guard";

export const metadata: Metadata = {
  metadataBase: new URL("https://compassfinance.online"),
  title: "CompassFinance — Learn. Practice. Grow your future.",
  description:
    "CompassFinance is an educational investing app: learn about U.S. markets, practice with a paper portfolio, and earn XP as you build real investing knowledge. Ask Compass, your AI tutor, whenever you need help.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ChunkReloadGuard />
        {/* This wrapper and the "phone" div below it both use min-h-dvh —
            on real mobile Safari the two can briefly disagree by a few px
            while the address bar collapses/expands, exposing a sliver of
            this wrapper's background at the bottom edge. The grey
            "device frame" look is desktop-only anyway, so keep this
            wrapper the same color as the inner canvas below md — any gap
            is then invisible instead of a visible seam. */}
        <div className="min-h-dvh w-full bg-canvas md:flex md:items-center md:justify-center md:bg-surface-2 md:py-10">
          {/* md:[contain:layout] — real, reported bug: BottomNavigation is
              `position:fixed` (see its own comment for why), which always
              positions against the real browser viewport, ignoring this
              "phone frame" wrapper's own bounds entirely — no ancestor's
              position/overflow constrains a fixed descendant unless that
              ancestor establishes a new containing block. On desktop this
              made the nav bar span the full (wide) browser window instead
              of staying inside the narrow simulated phone frame above it.
              `contain: layout` is the standard, spec'd way to make an
              element a containing block for its fixed/absolute
              descendants — scoped to md: only, since below that
              breakpoint there's no frame and `fixed` should anchor to the
              real device viewport as normal. */}
          <div className="mx-auto min-h-dvh w-full bg-canvas md:min-h-[860px] md:w-[420px] md:overflow-hidden md:rounded-[40px] md:border md:border-border md:shadow-2xl md:shadow-black/10 md:[contain:layout]">
            <AuthSessionProvider>
              <LocaleProvider>
                <NavigationHistoryProvider>
                  <WalletProvider>
                    <WalletLinkSync />
                    <FavoritesProvider>
                      <NotificationsProvider>
                        <PaperAccountProvider>
                          <HyperliquidAccountProvider>
                            <HyperliquidAgentProvider>
                              <ProgressProvider>{children}</ProgressProvider>
                            </HyperliquidAgentProvider>
                          </HyperliquidAccountProvider>
                        </PaperAccountProvider>
                      </NotificationsProvider>
                    </FavoritesProvider>
                  </WalletProvider>
                </NavigationHistoryProvider>
              </LocaleProvider>
            </AuthSessionProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
