"use client";

import Link from "next/link";
import { GraduationCap, Unlock, ArrowLeftRight, Trophy } from "lucide-react";
import { IconCircle } from "@/components/ui/icon-circle";
import { formatNotification } from "@/lib/notifications/format-notification";
import { useTranslation } from "@/lib/i18n/locale-provider";
import type { ColorKey } from "@/lib/mock-data";
import type { NotificationItem } from "@/lib/notifications/notifications-provider";

const ICON_BY_TYPE: Record<NotificationItem["type"], { Icon: typeof GraduationCap; color: ColorKey }> = {
  learning_completed: { Icon: GraduationCap, color: "purple" },
  investment_unlocked: { Icon: Unlock, color: "green" },
  paper_trade_completed: { Icon: ArrowLeftRight, color: "blue" },
  achievement_earned: { Icon: Trophy, color: "orange" },
};

export function NotificationRow({
  notification,
  onOpen,
}: {
  notification: NotificationItem;
  onOpen: (notification: NotificationItem) => void;
}) {
  const { locale } = useTranslation();
  const { title, body, href } = formatNotification(notification, locale);
  const { Icon, color } = ICON_BY_TYPE[notification.type];

  return (
    <Link
      href={href}
      onClick={() => onOpen(notification)}
      className="flex items-start gap-3 py-3.5"
    >
      <IconCircle colorKey={color} size="md">
        <Icon size={18} />
      </IconCircle>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        {body ? <p className="mt-0.5 text-[13px] text-ink-muted">{body}</p> : null}
      </div>
      {!notification.read ? (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue" aria-hidden="true" />
      ) : null}
    </Link>
  );
}
