"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

type ShareKind = "achievement" | "asset-unlock";

const SHARED_RESET_MS = 2000;

/**
 * Shares a real achievement or asset unlock. The server independently
 * re-verifies the achievement/unlock actually happened (see
 * achievement-sharing-service.ts) before it ever issues a share token —
 * this hook never composes or shows a share link the server hasn't
 * confirmed. Native Web Share API where available, clipboard as the
 * fallback — same two mechanisms as the referral share flow.
 */
export function useAchievementShare(): {
  share: (kind: ShareKind, id: string, message: string) => Promise<void>;
  sharing: boolean;
  shared: boolean;
  error: string | null;
  isSignedIn: boolean;
} {
  const { status } = useSession();
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share(kind: ShareKind, id: string, message: string) {
    if (status !== "authenticated") return;
    setSharing(true);
    setError(null);
    try {
      const endpoint =
        kind === "achievement" ? "/api/user/share/achievement" : "/api/user/share/asset-unlock";
      const body = kind === "achievement" ? { achievementId: id } : { assetId: id };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Couldn't create a share link.");
      }
      const { url } = (await res.json()) as { url: string };

      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share({ title: "CompassFinance", text: message, url });
          setShared(true);
          setTimeout(() => setShared(false), SHARED_RESET_MS);
          return;
        } catch {
          // User cancelled the share sheet, or share failed — fall
          // through to copy so the action still does something useful.
        }
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), SHARED_RESET_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't share right now.");
    } finally {
      setSharing(false);
    }
  }

  return { share, sharing, shared, error, isSignedIn: status === "authenticated" };
}
