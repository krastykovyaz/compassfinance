import Link from "next/link";
import { ChevronRight, LucideIcon } from "lucide-react";
import { IconCircle } from "@/components/ui/icon-circle";
import { ColorKey } from "@/lib/mock-data";

export function LinkRow({
  icon: Icon,
  label,
  trailing,
  colorKey = "slate",
  href,
}: {
  icon: LucideIcon;
  label: string;
  trailing?: string;
  colorKey?: ColorKey;
  /** When provided, the row navigates here (e.g. the Language row opening
   * /profile/language, or Invite friends opening /profile/invite). Omit
   * for rows with no destination screen — those render as a plain,
   * non-interactive status readout (no chevron, no button, no hover/
   * active state) so they never look tappable when there's nothing to
   * tap through to. */
  href?: string;
}) {
  const inner = (
    <>
      <IconCircle colorKey={colorKey} size="sm">
        <Icon size={15} />
      </IconCircle>
      <span className="flex-1 text-[14px] font-medium text-ink">{label}</span>
      {trailing ? (
        <span className="text-[13px] text-ink-muted">{trailing}</span>
      ) : null}
      {href ? <ChevronRight size={16} className="text-ink-faint" /> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex w-full items-center gap-3 py-3 text-left transition-colors active:bg-surface-2"
      >
        {inner}
      </Link>
    );
  }

  return <div className="flex w-full items-center gap-3 py-3 text-left">{inner}</div>;
}
