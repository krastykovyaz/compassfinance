"use client";

// Native horizontal scroll (overflow-x-auto + snap), not a carousel
// library — per Milestone 18 Section 6's explicit "native scrolling
// preferred, don't introduce a large carousel library" instruction.
//
// Card width is computed, not a fixed guess (Milestone 19 Section 1):
// each AssetProgressCard is sized to `calc((100% - 1.5rem) / 3)` — one
// third of this container's own content width, minus its share of the
// two `gap-3` (0.75rem) gaps between the 3 visible cards. That's exactly
// 3 complete cards filling the visible width with zero partial peek,
// on any viewport, since the width is relative to the container rather
// than a hardcoded pixel value. The 4th+ cards sit immediately past that
// same math, off-screen until the user scrolls — nothing is paginated
// away, everything is one swipe further right.

import { ReactNode } from "react";

export function ScrollableAssetSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold text-ink">{title}</h2>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        {children}
      </div>
    </section>
  );
}
