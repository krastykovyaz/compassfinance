import type { Metadata } from "next";
import "./globals.css";
import { ProgressProvider } from "@/lib/progress-store";
import { WalletProvider } from "@/lib/wallet/wallet-provider";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { NavigationHistoryProvider } from "@/lib/navigation/navigation-history-provider";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { FavoritesProvider } from "@/lib/favorites/favorites-provider";
import { NotificationsProvider } from "@/lib/notifications/notifications-provider";
import { PaperAccountProvider } from "@/lib/trading/paper-account-provider";

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
        <div className="min-h-dvh w-full bg-surface-2 md:flex md:items-center md:justify-center md:py-10">
          <div className="mx-auto min-h-dvh w-full bg-canvas md:min-h-[860px] md:w-[420px] md:overflow-hidden md:rounded-[40px] md:border md:border-border md:shadow-2xl md:shadow-black/10">
            <AuthSessionProvider>
              <LocaleProvider>
                <NavigationHistoryProvider>
                  <WalletProvider>
                    <FavoritesProvider>
                      <NotificationsProvider>
                        <PaperAccountProvider>
                          <ProgressProvider>{children}</ProgressProvider>
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
