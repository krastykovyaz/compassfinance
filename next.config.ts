import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server serve _next/* static chunks (JS bundles, HMR) when
  // this machine is reached over the LAN — e.g. testing on a phone via
  // http://<your-computer's-LAN-IP>:3000. Without this, Next 16 blocks
  // those cross-origin requests by default, which silently breaks every
  // client-rendered feature (charts, the practice-trade flow, the news
  // feed, etc.) even though the page itself returns 200 — that's what
  // "no news feed, no asset plots" from a phone almost always is.
  //
  // If your LAN IP changes (new network, DHCP renewal), add the new one
  // here too. A wildcard like "10.187.16.*" also works if you'd rather not
  // update this every time.
  allowedDevOrigins: ["10.187.16.24"],

  // Next.js compares the Server Action request's Origin header to the Host
  // (or X-Forwarded-Host) header and rejects mismatches as a CSRF guard. Behind
  // nginx on compassfinance.online this otherwise surfaces as "The Server
  // Reference ID did not match the expected format" for every form submit.
  experimental: {
    serverActions: {
      allowedOrigins: ["compassfinance.online", "www.compassfinance.online"],
    },
  },
};

export default nextConfig;
