import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { ApiError, withApiErrorHandling } from "@/server/api-helpers";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { requestFlexReport } from "@/server/interactive-brokers/interactive-brokers-flex-client";
import { connectInteractiveBrokersFlex } from "@/server/repositories/interactive-brokers-repository";

// Connect Interactive Brokers with a Flex Web Service token + Flex Query ID
// (the personal-account route: the user creates both in their own IBKR
// Client Portal and pastes them here, like the Trading 212 key and secret).
// Nothing is stored until Interactive Brokers has accepted the pair. userId
// always comes from requireUserId(), never the request body — see
// api-routes-idor.test.ts. A Flex token can only read reports.

const TOKEN_PATTERN = /^[A-Za-z0-9]{8,128}$/;
const QUERY_ID_PATTERN = /^\d{1,12}$/;

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();

    // Each attempt makes a real request to Interactive Brokers, which
    // limits Flex requests itself (about 10 a minute per token).
    if (!checkRateLimit(`ibkr-flex-connect:${userId}`)) {
      throw new ApiError("Too many requests — please wait a moment before trying again.", 429);
    }

    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const queryId = typeof body?.queryId === "string" ? body.queryId.trim() : "";
    if (!TOKEN_PATTERN.test(token)) {
      throw new ApiError("Enter the Flex token exactly as Interactive Brokers showed it.");
    }
    if (!QUERY_ID_PATTERN.test(queryId)) {
      throw new ApiError("The Query ID is the number shown next to your Flex Query.");
    }

    const check = await requestFlexReport({ token, queryId });
    if (!check.ok) {
      // check.message is one of a fixed set of sanitized strings, never
      // Interactive Brokers' own text.
      throw new ApiError(check.message);
    }

    return { connection: await connectInteractiveBrokersFlex(userId, { token, queryId }) };
  });
}
