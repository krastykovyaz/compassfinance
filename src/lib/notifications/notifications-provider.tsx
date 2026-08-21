"use client";

// Single, shared source of truth for notifications — same pattern as
// FavoritesProvider (src/lib/favorites/favorites-provider.tsx): the
// unread badge (Home's bell) and the /notifications list both need the
// same live state, so this fetches once per session and every consumer
// reads from the same context rather than each doing its own fetch.
// Backed by the real, persisted Notification table via /api/notifications
// — never mock/default data.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import type { NotificationEventType } from "@/server/validation";

export type NotificationItem = {
  id: string;
  type: NotificationEventType;
  sourceId: string;
  assetId: string | null;
  achievementId: string | null;
  tradeSide: "BUY" | "SELL" | null;
  read: boolean;
  createdAt: string;
};

type NotificationsApiResponse = { notifications: NotificationItem[]; unreadCount: number };

export type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  loaded: boolean;
  isSignedIn: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      const t = setTimeout(() => {
        setNotifications([]);
        setUnreadCount(0);
        setLoaded(status !== "loading");
      }, 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    fetch("/api/notifications")
      .then((res) => (res.ok ? (res.json() as Promise<NotificationsApiResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const markRead = useCallback(
    async (id: string) => {
      if (status !== "authenticated") return;
      const wasUnread = notifications.find((n) => n.id === id)?.read === false;
      if (!wasUnread) return;

      // Optimistic update, rolled back below on failure.
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
        if (!res.ok) throw new Error("mark-read failed");
      } catch {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)));
        setUnreadCount((c) => c + 1);
      }
    },
    [notifications, status]
  );

  const markAllRead = useCallback(async () => {
    if (status !== "authenticated") return;
    const previous = notifications;
    const previousUnread = unreadCount;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) throw new Error("mark-all-read failed");
    } catch {
      setNotifications(previous);
      setUnreadCount(previousUnread);
    }
  }, [notifications, unreadCount, status]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      loaded,
      isSignedIn: status === "authenticated",
      markRead,
      markAllRead,
    }),
    [notifications, unreadCount, loaded, status, markRead, markAllRead]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
