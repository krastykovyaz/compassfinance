"use client";

import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";
import { useSmartBack } from "@/lib/navigation/navigation-history-provider";

export function Header({
  title,
  logo,
  backHref,
  rightSlot,
}: {
  title: string;
  logo?: ReactNode;
  /** Safe fallback destination for this screen if there's no real
   * in-app history to retrace (direct link, fresh tab, hard refresh).
   * When there IS meaningful history, Back uses it instead — see
   * useSmartBack()/navigation-history.ts for the Milestone 9 fix. */
  backHref?: string;
  rightSlot?: ReactNode;
}) {
  const goBack = useSmartBack(backHref ?? "/");

  return (
    <header className="flex items-center justify-between px-5 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex items-center gap-2">
        {backHref ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <ArrowLeft size={20} />
          </button>
        ) : null}
        {logo}
        <h1 className="text-[19px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
      </div>
      {rightSlot ? <div className="flex items-center gap-1">{rightSlot}</div> : null}
    </header>
  );
}
