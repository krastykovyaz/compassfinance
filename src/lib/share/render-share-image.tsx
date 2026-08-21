import { ImageResponse } from "next/og";

export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * One reusable branded share-preview image, parameterized by a headline
 * and subtext — used by both the referral invite page and the
 * achievement-share page so there's a single visual template, not two
 * copies. Never renders any private data (portfolio value, holdings,
 * email, internal IDs) — callers only ever pass public-safe strings.
 */
export function renderShareImage(headline: string, subtext: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0f172a",
          padding: "80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "64px",
              height: "64px",
              borderRadius: "20px",
              backgroundColor: "#ffffff",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
            }}
          >
            🧭
          </div>
          <div style={{ display: "flex", fontSize: "36px", color: "#ffffff", fontWeight: 700 }}>
            CompassFinance
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "56px",
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.2,
            maxWidth: "900px",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "28px",
            color: "#94a3b8",
            marginTop: "24px",
            maxWidth: "800px",
          }}
        >
          {subtext}
        </div>
      </div>
    ),
    { ...SHARE_IMAGE_SIZE }
  );
}
