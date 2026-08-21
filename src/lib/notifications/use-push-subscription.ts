"use client";

// Web Push subscribe/unsubscribe — deliberately NOT a hook (no internal
// React state), just two plain async functions the Settings toggle calls
// directly from its own click handler, so `Notification.requestPermission()`
// only ever fires as a direct result of that user action, never on mount
// or any other implicit trigger.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Requests notification permission (must be called from inside a user
 * action, e.g. a toggle's onClick) and, if granted, subscribes this
 * browser to Web Push and persists the subscription server-side. Returns
 * false — without throwing — if push isn't supported, permission is
 * denied, or the VAPID public key isn't configured; the caller decides
 * whether to flip the preference on based on this result.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's DOM lib types BufferSource as requiring an ArrayBuffer-backed
        // view specifically, not the broader ArrayBufferLike a plain
        // `new Uint8Array(n)` infers — a Uint8Array is a valid
        // applicationServerKey at runtime regardless.
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    const res = await fetch("/api/user/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Unsubscribes this browser from Web Push and removes the server-side
 * record. Best-effort — never throws. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await fetch("/api/user/push-subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // Best-effort — nothing to roll back to.
  }
}
