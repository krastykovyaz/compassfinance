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

  return (
    <nav
      className="sticky bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur-sm"
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
