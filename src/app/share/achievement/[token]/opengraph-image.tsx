import { renderShareImage, SHARE_IMAGE_SIZE } from "@/lib/share/render-share-image";
import { getPublicShare } from "@/server/services/achievement-sharing-service";

export const size = SHARE_IMAGE_SIZE;
export const contentType = "image/png";

export default async function ShareOpengraphImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await getPublicShare(token);
  if (!share) {
    return renderShareImage("CompassFinance", "Learn markets and practice investing.");
  }
  const headline = share.assetName ? `${share.assetName} unlocked` : (share.achievementTitle ?? "Achievement unlocked");
  const subtext = `${share.sharerName} completed the learning path and unlocked paper trading.`;
  return renderShareImage(headline, subtext);
}
