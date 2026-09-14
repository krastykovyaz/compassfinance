"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useCompassUi } from "@/lib/compass/compass-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useSession } from "next-auth/react";

// How close to the bottom of the scrollable page (in px) counts as "at
// the end". Deliberately tiny — just enough tolerance for sub-pixel
// scroll rounding and iOS momentum overscroll, not a generous "almost
// there" zone. AppShell reserves real empty space below the last piece
// of content (its own bottom padding) for exactly this button to sit in;
// a bigger threshold reveals the button while genuine content is still
// unscrolled in that same fixed screen region, which then visibly
// overlaps it — a real reported bug the first time this shipped.
const BOTTOM_THRESHOLD_PX = 8;

// The single, app-wide Compass entry point (Phase 4, Section 28) —
// deliberately a floating pill, not a bottom-nav tab, positioned just
// above BottomNavigation (which is itself `fixed inset-x-0 bottom-0 z-20`
// — see app-shell.tsx). Uses Sparkles rather than the lucide `Compass`
// icon on purpose: that icon is already the Explore tab's icon in
// bottom-navigation.tsx, and reusing it here would visually conflate the
// two.
//
// Only shown once the user has scrolled to (or near) the bottom of the
// page — real feedback after shipping: sitting fixed on screen for the
// entire scroll of a long article/list covered content and felt in the
// way. A ResizeObserver on document.body (not just scroll/resize
// listeners) is required, not optional: content that loads in
// asynchronously below the fold (e.g. a news list paging in more items)
// changes scrollHeight without firing either event, which would
// otherwise leave a stale "near bottom" reading from before that content
// arrived.
export function CompassEntryButton() {
  const { open, isOpen } = useCompassUi();
  const { t } = useTranslation();
  const { status } = useSession();
  const pathname = usePathname();
  const [nearBottom, setNearBottom] = useState(false);

  useEffect(() => {
    function checkScrollPosition() {
      const doc = document.documentElement;
      const gap = doc.scrollHeight - window.scrollY - window.innerHeight;
      setNearBottom(gap < BOTTOM_THRESHOLD_PX);
    }

    checkScrollPosition();
    window.addEventListener("scroll", checkScrollPosition, { passive: true });
    window.addEventListener("resize", checkScrollPosition);
    const resizeObserver = new ResizeObserver(checkScrollPosition);
    resizeObserver.observe(document.body);

    return () => {
      window.removeEventListener("scroll", checkScrollPosition);
      window.removeEventListener("resize", checkScrollPosition);
      resizeObserver.disconnect();
    };
    // Re-checks on every navigation — a new page starts at a different
    // scroll position and height than whatever the previous one left
    // behind (CompassProvider, and this button with it, lives in the
    // root layout and never remounts on navigation).
  }, [pathname]);

  // Read-only intelligence about the user's OWN financial data — same
  // sign-in gate as every other personalized feature in the app. Hidden
  // (not just gated with an error) for a signed-out visitor, matching
  // this app's existing convention of hiding personalized entry points
  // rather than showing a dead-end CTA.
  if (status !== "authenticated" || isOpen || !nearBottom) return null;

  return (
    <button
      onClick={() => open()}
      aria-label={t("compass.entryButtonLabel")}
      className="fixed inset-x-0 z-30 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-purple px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-transform active:scale-95"
      // 16px above the nav bar's top edge. AppShell reserves 80px of
      // empty padding below the last real content field specifically to
      // fit this button (16px margin here + ~44px button height + ~20px
      // margin below the content) — increasing this offset without also
      // increasing AppShell's padding pushes the button back into real
      // content. See app-shell.tsx's own comment before changing either
      // number.
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom) + 16px)" }}
    >
      <Sparkles size={16} strokeWidth={2.4} />
      {t("compass.entryButtonLabel")}
    </button>
  );
}
