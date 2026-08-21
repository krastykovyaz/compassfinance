"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export type NotificationCategory = "news" | "priceAlerts" | "learning" | "achievements";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "news",
  "priceAlerts",
  "learning",
  "achievements",
];

const DEFAULTS: Record<NotificationCategory, boolean> = {
  news: true,
  priceAlerts: true,
  learning: true,
  achievements: true,
};

// Delivery channels (Milestone 25) — separate from the content categories
// above. There is no push/email delivery infrastructure configured yet;
// these toggles persist the user's real preference and gate the
// event-integration layer (see notification-events.ts server-side), they
// never imply a message was actually sent.
export type NotificationChannel = "push" | "email";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ["push", "email"];

const CHANNEL_DEFAULTS: Record<NotificationChannel, boolean> = {
  push: true,
  email: true,
};

/**
 * The one place that fetches real, persisted notification preferences —
 * NotificationsCard (the toggle UI) and the Profile page's summary row
 * both use this instead of each doing their own fetch, so there's a
 * single source of truth, not two copies that could show different
 * numbers. Covers both content categories and delivery channels, backed
 * by the same server-side preferences state.
 */
export function useNotificationPreferences(): {
  prefs: Record<NotificationCategory, boolean>;
  channels: Record<NotificationChannel, boolean>;
  loaded: boolean;
  isSignedIn: boolean;
  toggle: (category: NotificationCategory) => void;
  toggleChannel: (channel: NotificationChannel) => void;
} {
  const { status } = useSession();
  const [prefs, setPrefs] = useState<Record<NotificationCategory, boolean>>(DEFAULTS);
  const [channels, setChannels] = useState<Record<NotificationChannel, boolean>>(CHANNEL_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/user/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.preferences) setPrefs(data.preferences);
        if (data?.channels) setChannels(data.channels);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  function toggle(category: NotificationCategory) {
    const next = !prefs[category];
    setPrefs((p) => ({ ...p, [category]: next })); // optimistic
    fetch("/api/user/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, enabled: next }),
    }).catch(() => {
      setPrefs((p) => ({ ...p, [category]: !next })); // roll back
    });
  }

  function toggleChannel(channel: NotificationChannel) {
    const next = !channels[channel];
    setChannels((c) => ({ ...c, [channel]: next })); // optimistic
    fetch("/api/user/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, enabled: next }),
    }).catch(() => {
      setChannels((c) => ({ ...c, [channel]: !next })); // roll back
    });
  }

  return { prefs, channels, loaded, isSignedIn: status === "authenticated", toggle, toggleChannel };
}
