"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslation } from "@/lib/i18n/locale-provider";

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setError(t("auth.errorBody"));
      setGoogleSubmitting(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailSubmitting(true);
    try {
      const res = await signIn("compass-email", {
        email,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setError(t("auth.errorBody"));
      } else {
        setEmailSent(true);
      }
    } catch {
      setError(t("auth.errorBody"));
    } finally {
      setEmailSubmitting(false);
    }
  }

  if (emailSent) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 text-center">
        <p className="text-[15px] font-medium text-ink">{t("auth.checkYourEmail")}</p>
        <p className="text-[13px] leading-5 text-ink-muted">{t("auth.checkYourEmailBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3.5 text-[15px] font-medium text-ink active:opacity-90 disabled:opacity-60"
      >
        <GoogleGlyph />
        {t("auth.continueWithGoogle")}
      </button>

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[12px] text-ink-faint">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-[15px] text-ink outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={emailSubmitting || !email}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-medium text-surface active:opacity-90 disabled:opacity-60"
        >
          {emailSubmitting ? t("auth.sending") : t("auth.sendLink")}
        </button>
      </form>

      {error && <p className="text-center text-[13px] text-negative">{error}</p>}

      <p className="pt-2 text-center text-[12px] leading-4 text-ink-faint">
        {t("auth.termsNotice")}
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}
