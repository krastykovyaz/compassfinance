import type { Metadata } from "next";
import { getPublicShare } from "@/server/services/achievement-sharing-service";
import { ShareLanding } from "@/components/invite/share-landing";

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

  const title = share.assetName
    ? `CompassFinance — ${share.assetName} unlocked`
    : `CompassFinance — ${share.achievementTitle}`;
  const description = share.assetName
    ? `${share.sharerName} completed the ${share.assetName} learning path and unlocked paper trading.`
    : `${share.sharerName} earned the "${share.achievementTitle}" achievement on CompassFinance.`;

  return {
    title,
    description,
    openGraph: { title, description, url: `/share/achievement/${token}`, siteName: "CompassFinance", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

// Public page — `share` only ever carries the public-safe fields
// getPublicShare() selects (see that function's doc comment): asset/
// achievement name and a display name that falls back to a generic
// label. No email, no internal id, no portfolio value, no holdings, no
// trading history ever reaches this page.
export default async function AchievementSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await getPublicShare(token);
  return <ShareLanding share={share} />;
}
