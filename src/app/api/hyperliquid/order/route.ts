// POST /api/hyperliquid/order
//
// Relays an ALREADY-SIGNED Hyperliquid action (leverage update or order
// placement) — this route never signs anything and never sees a private
// key. The signature was produced client-side, inside the user's own
// connected wallet, before this request was ever sent. Auth-gated for
// product consistency (same stance as account/route.ts).
//
// requireUserId() used to be a gate only, its value discarded immediately —
// the actual Hyperliquid call is address-only, and Hyperliquid itself
// independently recovers the true signer from the signature, so a
// mismatched client-declared address can't move anyone else's funds (see
// submitHyperliquidExchangeAction's own comments for that reasoning, still
// true and unchanged). Phase 7 now DOES forward userId downstream too,
// but only to look up the caller's OWN learning progress for the
// real-trading education gate — never used to authorize the trade itself
// or attributed to a different account.

import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { isValidEvmAddress } from "@/server/validation";
import { checkRateLimit, getClientKey } from "@/lib/ai/rate-limit";
import { submitHyperliquidExchangeAction } from "@/server/hyperliquid/service";

type SubmissionBody = {
  address: string;
  action: Record<string, unknown>;
  nonce: number;
  signature: { r: string; s: string; v: number };
};

function isValidSignature(value: unknown): value is SubmissionBody["signature"] {
  if (!value || typeof value !== "object") return false;
  const sig = value as Record<string, unknown>;
  return typeof sig.r === "string" && typeof sig.s === "string" && (sig.v === 27 || sig.v === 28);
}

function isValidSubmissionBody(value: unknown): value is SubmissionBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.address === "string" &&
    isValidEvmAddress(body.address) &&
    !!body.action &&
    typeof body.action === "object" &&
    typeof body.nonce === "number" &&
    isValidSignature(body.signature)
  );
}

export async function POST(req: Request) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();

    if (!checkRateLimit(`hl-order:${getClientKey(req.headers)}`)) {
      throw new Error("Too many requests — please wait a moment before trying again.");
    }

    const body = await req.json().catch(() => null);
    if (!isValidSubmissionBody(body)) {
      throw new Error("A valid address, action, nonce, and signature are required");
    }

    const result = await submitHyperliquidExchangeAction(
      userId,
      body.address,
      body.action,
      body.nonce,
      body.signature
    );

    return { result };
  });
}
