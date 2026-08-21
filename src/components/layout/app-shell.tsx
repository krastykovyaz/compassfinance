import { ReactNode } from "react";
import { BottomNavigation } from "./bottom-navigation";
import { AchievementToast } from "@/components/learning/achievement-toast";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <AchievementToast />
      <div className="flex-1 pb-6">{children}</div>
      <BottomNavigation />
    </div>
  );
}
