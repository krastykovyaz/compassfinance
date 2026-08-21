import "server-only";
import { auth } from "@/auth";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

/**
 * The ONLY place a userId should come from for any user-owned database
 * operation: the authenticated session, never `req.body.userId` /
 * `searchParams.get("userId")` (Section 20). Every repository/service
 * function in src/server/repositories requires a userId argument for
 * exactly this reason — so it's always this value, sourced here, and never
 * threaded through from client input.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new UnauthenticatedError();
  }
  return userId;
}

export async function getOptionalUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
