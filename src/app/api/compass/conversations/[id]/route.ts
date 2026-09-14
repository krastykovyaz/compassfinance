// GET /api/compass/conversations/[id]
//
// Loads one Compass conversation, scoped to the authenticated user
// (Section 45's "load conversation" / cross-user isolation requirement).
// getCompassConversation's own WHERE clause is the ownership check —
// this route never loads-then-filters in application code.

import { NextResponse } from "next/server";
import { requireUserId, UnauthenticatedError } from "@/server/auth/session";
import { getCompassConversation } from "@/server/repositories/compass-conversation-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
    }
    throw err;
  }

  const { id } = await params;
  const conversation = await getCompassConversation(userId, id);
  if (!conversation) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, conversation });
}
