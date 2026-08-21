import type { NotificationChannel } from "./use-notification-preferences";

const CHANNEL_ORDER: NotificationChannel[] = ["push"];

/**
 * "Push" if enabled, null if not — the Profile summary row falls back to
 * a localized "Off" label in that case rather than rendering an empty
 * string. Kept as a join over CHANNEL_ORDER (rather than a plain boolean
 * check) so a future second real channel just extends the array here.
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
