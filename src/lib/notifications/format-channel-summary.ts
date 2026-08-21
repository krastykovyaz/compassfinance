import type { NotificationChannel } from "./use-notification-preferences";

const CHANNEL_ORDER: NotificationChannel[] = ["push", "email"];

/**
 * "Push, email" if both are on, "Push" or "Email" if only one is, null if
 * neither is — the Profile summary row falls back to a localized "Off"
 * label in that last case rather than rendering an empty string. Only the
 * first enabled channel keeps its label's original casing; the rest are
 * lowercased to read as a natural list, matching the spec's example.
 */
export function formatEnabledChannelsSummary(
  channels: Record<NotificationChannel, boolean>,
  labels: Record<NotificationChannel, string>
): string | null {
  const enabled = CHANNEL_ORDER.filter((c) => channels[c]);
  if (enabled.length === 0) return null;
  return enabled
    .map((c, i) => {
      const label = labels[c];
      return i === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1);
    })
    .join(", ");
}
