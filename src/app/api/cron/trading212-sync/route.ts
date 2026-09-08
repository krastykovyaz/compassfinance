import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runTrading212AutoSyncCycle } from "@/server/trading212/trading212-scheduler";
import { getTrading212CronSecret } from "@/server/trading212/trading212-sync-config";

// Requirement 2/19: an operator-triggerable entry point into the exact
// same automatic-sync cycle instrumentation.ts's interval already calls —
// useful for manually kicking a cycle (ops/debugging/tests) and for
// portability if this deployment ever moves to a platform with its own
// HTTP-triggered cron (Vercel Cron, GitHub Actions, etc.), without ever
// being a second scheduling implementation. Protected by a server-only
// secret — this is NOT under src/app/api/user/, so it is deliberately
// NOT a user-session-authenticated route at all (there is no "current
// user" for a cron trigger); it is authorized purely by knowing the
// secret, which never reaches the browser (not a NEXT_PUBLIC_* var, never
// referenced from any client component).

function isAuthorized(req: NextRequest): boolean {
  const secret = getTrading212CronSecret();
  if (!secret) return false; // fail closed: unconfigured means unreachable, not "open"

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!provided) return false;

  // Constant-time comparison — a plain === would leak how many leading
  // characters matched via response-timing, letting an attacker guess the
  // secret one byte at a time.
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTrading212AutoSyncCycle();
  return NextResponse.json(result);
}
