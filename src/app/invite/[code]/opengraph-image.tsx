import { renderShareImage, SHARE_IMAGE_SIZE } from "@/lib/share/render-share-image";
import { getReferrerLocaleByCode } from "@/server/repositories/referral-repository";
import { translate, toSupportedLocale } from "@/lib/i18n/translate";

export const size = SHARE_IMAGE_SIZE;
export const contentType = "image/png";

export default async function InviteOpengraphImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const referrerLocale = await getReferrerLocaleByCode(code);
  const valid = referrerLocale !== null;
  const locale = toSupportedLocale(referrerLocale);
  return renderShareImage(
    valid ? translate(locale, "invite.title") : "CompassFinance",
    valid ? translate(locale, "invite.subtitle") : "Learn markets and practice investing."
  );
}
