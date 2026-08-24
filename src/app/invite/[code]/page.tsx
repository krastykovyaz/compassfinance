import { getReferrerLocaleByCode } from "@/server/repositories/referral-repository";
import { InviteLanding } from "@/components/invite/invite-landing";
import { translate, toSupportedLocale } from "@/lib/i18n/translate";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  // Rendered in the REFERRER's own account language, not the visitor's —
  // an anonymous link recipient has no locale of their own to speak of.
  const referrerLocale = await getReferrerLocaleByCode(code);
  const valid = referrerLocale !== null;
  const locale = toSupportedLocale(referrerLocale);
  const title = valid ? translate(locale, "invite.title") : "CompassFinance";
  const description = valid
    ? translate(locale, "invite.subtitle")
    : "CompassFinance — learn markets and practice investing.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/invite/${code}`,
      siteName: "CompassFinance",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// Public page — deliberately never looks up or renders anything about
// the referring user (name, email, id) — only their account language, so
// this page and its share preview render in the same language the
// referrer was using. The actual cookie that carries the code through
// sign-in is already set by proxy.ts before this page ever renders
// (Server Components can't set cookies during render, so that has to
// happen at the proxy layer).
export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const referrerLocale = await getReferrerLocaleByCode(code);
  return <InviteLanding valid={referrerLocale !== null} locale={toSupportedLocale(referrerLocale)} />;
}
