import type { Metadata } from "next";
import { getPublicShare } from "@/server/services/achievement-sharing-service";
import { ShareLanding } from "@/components/invite/share-landing";
import { translate, toSupportedLocale } from "@/lib/i18n/translate";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const share = await getPublicShare(token);

  if (!share) {
    return { title: "CompassFinance", description: "CompassFinance — learn markets and practice investing." };
  }

  // Rendered in the SHARER's own account language — same idea as the
  // message text they typed when they shared it (see
  // use-achievement-share.ts) — never the visitor's browser locale, which
  // for an anonymous link recipient means nothing anyway.
  const locale = share.locale;
  const title = share.assetName
    ? `CompassFinance — ${share.assetName}`
    : `CompassFinance — ${share.achievementTitle}`;
  const description = share.assetName
    ? `${translate(locale, "achievementShare.assetMessagePrefix")} ${share.assetName} ${translate(locale, "achievementShare.assetMessageMiddle")} ${translate(locale, "achievementShare.assetMessageSuffix")}`
    : `${translate(locale, "achievementShare.achievementMessagePrefix")} ${share.achievementTitle} ${translate(locale, "achievementShare.achievementMessageSuffix")}`;

  return {
    title,
    description,
    openGraph: { title, description, url: `/share/achievement/${token}`, siteName: "CompassFinance", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

// Public page — `share` only ever carries the public-safe fields
// getPublicShare() selects (see that function's doc comment): asset/
// achievement name, a display name that falls back to a generic label,
// and the sharer's account language. No email, no internal id, no
// portfolio value, no holdings, no trading history ever reaches this page.
export default async function AchievementSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await getPublicShare(token);
  return <ShareLanding share={share} locale={toSupportedLocale(share?.locale)} />;
}
