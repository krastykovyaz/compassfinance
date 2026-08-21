"use client";

import { Cpu, HeartPulse, Bot, Leaf, ShoppingBag } from "lucide-react";
import { IconCircle } from "@/components/ui/icon-circle";
import { ThemeItem } from "@/lib/mock-data";

const iconMap = {
  cpu: Cpu,
  heartpulse: HeartPulse,
  bot: Bot,
  leaf: Leaf,
  shoppingbag: ShoppingBag,
};

export function ThemeChip({ theme }: { theme: ThemeItem }) {
  const Icon = iconMap[theme.icon];
  return (
    <button className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">
      <IconCircle colorKey={theme.colorKey} size="lg">
        <Icon size={20} />
      </IconCircle>
      <span className="text-[11px] font-medium leading-tight text-ink-muted">
        {theme.label}
      </span>
    </button>
  );
}
