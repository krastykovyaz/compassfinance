"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, LogIn } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function AccountCard() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();

  // Guest mode (Milestone 12, Section 7): browsing/learning works without
  // an account, but there needs to be a discoverable way back to /signin
  // for anyone who wants their progress to persist — this is the only
  // entry point into the auth flow now that proxy.ts no longer forces a
  // redirect on every route.
  if (status !== "authenticated" || !session?.user) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-medium text-ink">{t("auth.guestTitle")}</p>
            <p className="text-[12px] text-ink-faint">{t("auth.guestBody")}</p>
          </div>
          <Link
            href="/signin"
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-[13px] font-medium text-surface hover:opacity-90"
          >
            <LogIn size={15} />
            {t("auth.signIn")}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconCircle colorKey="slate" size="md">
            <span className="text-[13px] font-semibold">
              {(session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase()}
            </span>
          </IconCircle>
          <div>
            <p className="text-[14px] font-medium text-ink">
              {session.user.name ?? session.user.email}
            </p>
            {session.user.email && (
              <p className="text-[12px] text-ink-faint">{session.user.email}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-2"
        >
          <LogOut size={15} />
          {t("auth.signOut")}
        </button>
      </div>
    </Card>
  );
}
