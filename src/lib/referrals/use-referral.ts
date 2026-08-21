"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export type ReferralData = { code: string; url: string; referralCount: number };

/**
 * Fetches the authenticated user's real referral code/URL from
 * /api/user/referral. Returns null while loading or when signed out —
 * an unauthenticated visitor never gets a personal referral link, by
 * construction (the API itself 401s; this hook just never calls it).
 */
export function useReferral(): {
  referral: ReferralData | null;
  isLoading: boolean;
  error: string | null;
  isSignedIn: boolean;
} {
  const { status } = useSession();
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      const t = setTimeout(() => setIsLoading(false), 0);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    fetch("/api/user/referral")
      .then((r) => {
        if (!r.ok) throw new Error(`referral fetch failed (${r.status})`);
        return r.json();
      })
      .then((data: ReferralData) => {
        if (!cancelled) setReferral(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load your invite link");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return { referral, isLoading, error, isSignedIn: status === "authenticated" };
}
