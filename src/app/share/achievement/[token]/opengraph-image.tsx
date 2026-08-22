import { renderShareImage, SHARE_IMAGE_SIZE } from "@/lib/share/render-share-image";
import { getPublicShare } from "@/server/services/achievement-sharing-service";
import { translate } from "@/lib/i18n/translate";

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

  // Same language the sharer had their account set to — see page.tsx's
  // generateMetadata for why.
  const locale = share.locale;
  const headline = share.assetName ? `${share.assetName}` : (share.achievementTitle ?? "CompassFinance");
  const subtext = share.assetName
    ? `${translate(locale, "achievementShare.assetMessagePrefix")} ${share.assetName} ${translate(locale, "achievementShare.assetMessageMiddle")} ${translate(locale, "achievementShare.assetMessageSuffix")}`
    : `${translate(locale, "achievementShare.achievementMessagePrefix")} ${share.achievementTitle} ${translate(locale, "achievementShare.achievementMessageSuffix")}`;
  return renderShareImage(headline, subtext);
}
