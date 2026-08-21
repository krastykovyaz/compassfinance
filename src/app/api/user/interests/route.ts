import { NextRequest } from "next/server";
import { requireUserId } from "@/server/auth/session";
import { withApiErrorHandling } from "@/server/api-helpers";
import { listInterests, addInterest } from "@/server/repositories/interests-repository";

export async function GET() {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    return { interests: await listInterests(userId) };
  });
}

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const userId = await requireUserId();
    const { key } = await req.json();
    return { interests: await addInterest(userId, key) };
  });
}
