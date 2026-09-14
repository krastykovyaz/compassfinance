import { ReactNode } from "react";
import { BottomNavigation } from "./bottom-navigation";
import { AchievementToast } from "@/components/learning/achievement-toast";

// CompassProvider lives in the root layout (app/layout.tsx), NOT here.
// Every page calls useSetCompassContext/useCompassUi at its OWN top
// level, in its OWN render — i.e. as a component that RETURNS <AppShell>,
// not as a descendant of it. A provider mounted inside AppShell would sit
// below those hook calls in the tree and could never satisfy them (this
// broke the production build the first time it was tried: "useCompassUi
// must be used within a CompassProvider" while prerendering "/"). The
// provider must be an ancestor of every page component, which only the
// root layout actually is.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <AchievementToast />
      {/* BottomNavigation is `fixed`, so it no longer reserves its own
       * space in flow — this padding stands in for that (nav's own
       * content height plus its safe-area inset), plus an extra 80px
       * reserved slot for CompassEntryButton to float in once the user
       * scrolls to the bottom. That 80px is not arbitrary — it must stay
       * bigger than CompassEntryButton's own (offset-above-nav + height +
       * margin-above-content), or the button ends up floating on top of
       * real content instead of in empty space (a real reported bug the
       * first time this shipped with only a 24px cushion). See
       * compass-entry-button.tsx's own `bottom` offset comment before
       * changing either number. */}
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom)+80px)]">{children}</div>
      <BottomNavigation />
    </div>
  );
}
