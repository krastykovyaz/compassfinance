import { renderShareImage, SHARE_IMAGE_SIZE } from "@/lib/share/render-share-image";
import { getUserIdByReferralCode } from "@/server/repositories/referral-repository";

export const size = SHARE_IMAGE_SIZE;
export const contentType = "image/png";

export default async function InviteOpengraphImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const valid = (await getUserIdByReferralCode(code)) !== null;
  return renderShareImage(
    valid ? "You're invited" : "CompassFinance",
    valid
      ? "Learn markets and practice investing with a real paper portfolio."
      : "Learn markets and practice investing."
  );
}
