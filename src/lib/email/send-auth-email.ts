import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { CompassAuthEmail } from "./templates/compass-auth-email";

// All Resend calls happen server-side only (Section 5). This module is
// never imported by a client component — importing "server-only" makes
// that a build error if it ever is.

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local — see .env.example."
    );
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const EXPIRES_IN_MINUTES = 15;

export async function sendCompassAuthEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  const from = process.env.EMAIL_FROM ?? "CompassFinance <no-reply@compass.app>";

  const html = await render(
    CompassAuthEmail({ url, expiresInMinutes: EXPIRES_IN_MINUTES })
  );
  const text = await render(
    CompassAuthEmail({ url, expiresInMinutes: EXPIRES_IN_MINUTES }),
    { plainText: true }
  );

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Sign in to CompassFinance",
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend failed to send auth email: ${error.message}`);
  }
}
