import { NextResponse } from "next/server";
import { UnauthenticatedError } from "@/server/auth/session";
import { ApiError } from "@/server/api-error";

export { ApiError };

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Wraps a route handler body so every user-data route gets the same
 * error handling without repeating try/catch everywhere:
 *   - UnauthenticatedError -> 401 (Section 20)
 *   - ApiError             -> its own status (400 by default) and message
 *   - anything else        -> 500 with a generic message. The real error is
 *     logged here (name and a truncated message, never the stack or the
 *     Prisma argument object) and never sent to the client: a database,
 *     decrypt or provider error names tables, fields and hosts. */
export async function withApiErrorHandling<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? {});
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api] unhandled error:", err instanceof Error ? `${err.name}: ${err.message.slice(0, 300)}` : "non-error value thrown");
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}
