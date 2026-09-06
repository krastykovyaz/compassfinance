import { ReactNode } from "react";
import { BottomNavigation } from "./bottom-navigation";
import { AchievementToast } from "@/components/learning/achievement-toast";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <AchievementToast />
      {/* BottomNavigation is `fixed`, so it no longer reserves its own
       * space in flow — this padding stands in for that (nav's own
       * content height plus its safe-area inset) so it never overlaps
       * the last bit of content. See BottomNavigation's own comment. */}
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNavigation />
    </div>
  );
}
