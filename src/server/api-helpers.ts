import { NextResponse } from "next/server";
import { UnauthenticatedError } from "@/server/auth/session";

/** Wraps a route handler body so every user-data route gets the same
 * 401 (Section 20)/400 handling without repeating try/catch everywhere. */
export async function withApiErrorHandling<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? {});
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
