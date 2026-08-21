"use client";

import { Card } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { cn } from "@/lib/utils";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  useNotificationPreferences,
} from "@/lib/notifications/use-notification-preferences";

const LABEL_KEY: Record<string, string> = {
  news: "notifications.news",
  priceAlerts: "notifications.priceAlerts",
  learning: "notifications.learning",
  achievements: "notifications.achievements",
};

const CHANNEL_LABEL_KEY: Record<string, string> = {
  push: "notifications.push",
  email: "notifications.email",
};

function ToggleRow({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-[14px] font-medium text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-ink" : "bg-surface-2"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

// Preferences only — no delivery. This card just persists channel/category
// on-off state server-side; it doesn't send or simulate any push/email
// message. If push/email delivery infrastructure is configured later, it
// reads these same preferences rather than a second state.
export function NotificationsCard() {
  const { t } = useTranslation();
  const { prefs, channels, loaded, isSignedIn, toggle, toggleChannel } = useNotificationPreferences();

  if (!isSignedIn) {
    return (
      <Card>
        <p className="text-[13px] text-ink-faint">{t("notifications.signInRequired")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 px-1 text-[13px] font-medium text-ink-muted">
          {t("notifications.channelsHeading")}
        </p>
        <Card className="divide-y divide-border p-0 px-4">
          {NOTIFICATION_CHANNELS.map((c) => (
            <ToggleRow
              key={c}
              label={t(CHANNEL_LABEL_KEY[c])}
              checked={channels[c]}
              disabled={!loaded}
              onToggle={() => toggleChannel(c)}
            />
          ))}
        </Card>
      </div>

      <div>
        <p className="mb-1.5 px-1 text-[13px] font-medium text-ink-muted">
          {t("notifications.categoriesHeading")}
        </p>
        <Card className="divide-y divide-border p-0 px-4">
          {NOTIFICATION_CATEGORIES.map((c) => (
            <ToggleRow
              key={c}
              label={t(LABEL_KEY[c])}
              checked={prefs[c]}
              disabled={!loaded}
              onToggle={() => toggle(c)}
            />
          ))}
        </Card>
      </div>
    </div>
  );
}
