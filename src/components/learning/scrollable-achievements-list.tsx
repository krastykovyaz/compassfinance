"use client";

// Native internal vertical scroll (overflow-y-auto on a height-capped
// container), distinct from ScrollableAssetSection's horizontal scroll —
// Achievements is a vertical list, not a horizontal card row (Milestone
// 20 Section 5 is explicit that these must NOT behave the same way).
//
// Achievement cards have variable height (title + a description that
// can run one or two lines + an XP line), so unlike the Learning
// Progress cards' exact `calc()` width, there's no way to guarantee a
// pixel-perfect "exactly 3" here without measuring rendered content.
// MAX_HEIGHT below is a deliberate estimate — one card's typical height
// (~88px, from Card's p-4 padding + icon row + a single-line title/
// description/XP stack) times 3, plus 2 list gaps — sized to comfortably
// show about 3 complete cards on the target mobile layout without
// slicing the array or removing anything: every achievement still
// renders inside the container, just scrollable.

import { ReactNode } from "react";

const ACHIEVEMENT_CARD_HEIGHT_PX = 88;
const LIST_GAP_PX = 10; // matches gap-2.5
const VISIBLE_COUNT = 3;
const MAX_HEIGHT_PX =
  ACHIEVEMENT_CARD_HEIGHT_PX * VISIBLE_COUNT + LIST_GAP_PX * (VISIBLE_COUNT - 1);

export function ScrollableAchievementsList({ children }: { children: ReactNode }) {
  return (
    <div
      className="no-scrollbar flex flex-col gap-2.5 overflow-y-auto"
      style={{ maxHeight: `${MAX_HEIGHT_PX}px` }}
    >
      {children}
    </div>
  );
}
