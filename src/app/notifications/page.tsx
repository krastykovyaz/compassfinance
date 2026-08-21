"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { NotificationRow } from "@/components/notifications/notification-row";
import { useNotifications, type NotificationItem } from "@/lib/notifications/notifications-provider";
import { useTranslation } from "@/lib/i18n/locale-provider";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, unreadCount, loaded, isSignedIn, markRead, markAllRead } = useNotifications();

  function handleOpen(notification: NotificationItem) {
    if (!notification.read) markRead(notification.id);
  }

  return (
    <AppShell>
      <Header
        title={t("linkRows.notifications")}
        backHref="/"
        rightSlot={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAllRead()}
              className="text-[13px] font-medium text-blue"
            >
              {t("notifications.markAllRead")}
            </button>
          ) : null
        }
      />

      <div className="px-5">
        {!isSignedIn ? (
          <Card>
            <p className="text-[13px] text-ink-faint">{t("notifications.signInRequired")}</p>
          </Card>
        ) : !loaded ? null : notifications.length === 0 ? (
          <Card>
            <p className="text-[13px] text-ink-faint">{t("notifications.emptyState")}</p>
          </Card>
        ) : (
          <Card className="divide-y divide-border p-0 px-4">
            {notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} onOpen={handleOpen} />
            ))}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
