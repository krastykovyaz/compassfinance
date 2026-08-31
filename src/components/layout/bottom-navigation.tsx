"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, Newspaper, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/locale-provider";

const items = [
  { href: "/", labelKey: "navigation.home", icon: Home },
  { href: "/explore", labelKey: "navigation.explore", icon: Compass },
  { href: "/news", labelKey: "navigation.news", icon: Newspaper },
  { href: "/portfolio", labelKey: "navigation.portfolio", icon: Wallet },
  { href: "/profile", labelKey: "navigation.profile", icon: User },
];

export function BottomNavigation() {
  const pathname = usePathname();
  const { t } = useTranslation();

  // `fixed`, not `sticky` — real, reported bug: with `sticky`, this bar
  // still occupies its own space in normal flow, so its on-screen position
  // depends on total document height at any given moment. Any page with a
  // loading state shorter than its loaded content (a skeleton, an empty
  // state) made the bar visibly jump as that height changed underneath it
  // — reproduced on both the Hyperliquid account panel's polling skeleton
  // and the News page's initial loading skeleton, i.e. not specific to
  // either page. `fixed` pins it to the viewport regardless of document
  // height; AppShell compensates with matching bottom padding on the
  // content area so the bar never overlaps the last bit of content.
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur-sm"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-[420px] items-stretch justify-between px-2 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-2">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium"
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 2}
                  className={cn(
                    "transition-colors",
                    active ? "text-purple" : "text-ink-faint"
                  )}
                />
                <span
                  className={cn(
                    "transition-colors",
                    active ? "text-ink" : "text-ink-faint"
                  )}
                >
                  {t(item.labelKey)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
