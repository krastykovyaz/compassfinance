import { getUserIdByReferralCode } from "@/server/repositories/referral-repository";
import { InviteLanding } from "@/components/invite/invite-landing";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const valid = (await getUserIdByReferralCode(code)) !== null;
  const title = valid ? "You're invited to CompassFinance" : "CompassFinance";
  const description = valid
    ? "Learn markets, practice investing with a real paper portfolio, and grow at your pace."
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
// the referring user (name, email, id). It only confirms the code maps
// to a real referral and shows a generic welcome; the actual cookie that
// carries the code through sign-in is already set by proxy.ts before
// this page ever renders (Server Components can't set cookies during
// render, so that has to happen at the proxy layer).
export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const referrerUserId = await getUserIdByReferralCode(code);
  return <InviteLanding valid={referrerUserId !== null} />;
}
