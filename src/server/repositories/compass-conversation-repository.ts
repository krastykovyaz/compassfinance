import "server-only";
import { prisma } from "@/server/db/prisma";
import { encodeContextKey, decodeContext, type CompassContext } from "@/lib/compass/context";

// Conversation/Message persistence for the Compass Agent (Phase 4,
// Section 23). Every query here takes userId as an explicit parameter and
// filters on it directly in the WHERE clause — never trusts a client-
// supplied ownership claim, and never loads a row first to "check" the
// owner in application code (a scoped WHERE is the actual guarantee,
// not a post-hoc filter). Section 23 also forbids storing broker API
// keys/OAuth secrets/private keys/signing material inside messages —
// this repository stores exactly the plain text/JSON the engine hands
// it and never accepts or forwards credential-shaped fields.

export type CompassMessageRole = "user" | "assistant";

export type CompassMessageDTO = {
  id: string;
  conversationId: string;
  role: CompassMessageRole;
  content: string;
  structuredData: string | null;
  createdAt: string;
};

export type CompassConversationDTO = {
  id: string;
  userId: string;
  context: CompassContext | null;
  createdAt: string;
  updatedAt: string;
};

export type CompassConversationWithMessagesDTO = CompassConversationDTO & { messages: CompassMessageDTO[] };

function toMessageDTO(row: { id: string; conversationId: string; role: string; content: string; structuredData: string | null; createdAt: Date }): CompassMessageDTO {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    structuredData: row.structuredData,
    createdAt: row.createdAt.toISOString(),
  };
}

function toConversationDTO(row: { id: string; userId: string; contextType: string; contextKey: string | null; createdAt: Date; updatedAt: Date }): CompassConversationDTO {
  return {
    id: row.id,
    userId: row.userId,
    context: decodeContext(row.contextType, row.contextKey),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Creates a new conversation scoped to userId, with its first user
 * message already attached (a conversation with zero messages is never a
 * useful state for this app — the engine always has a first message in
 * hand before it needs a conversation row to exist). */
export async function createCompassConversation(params: {
  userId: string;
  context: CompassContext;
  firstMessage: { role: CompassMessageRole; content: string; structuredData: string | null };
}): Promise<CompassConversationWithMessagesDTO> {
  const row = await prisma.compassConversation.create({
    data: {
      userId: params.userId,
      contextType: params.context.type,
      contextKey: encodeContextKey(params.context),
      messages: { create: [{ role: params.firstMessage.role, content: params.firstMessage.content, structuredData: params.firstMessage.structuredData }] },
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return { ...toConversationDTO(row), messages: row.messages.map(toMessageDTO) };
}

/** Appends one message to an existing conversation AND bumps
 * updatedAt — always called only after the caller has already verified
 * ownership via getCompassConversation (never trusts a bare
 * conversationId on its own). */
export async function appendCompassMessage(params: {
  conversationId: string;
  role: CompassMessageRole;
  content: string;
  structuredData: string | null;
}): Promise<CompassMessageDTO> {
  const [, message] = await prisma.$transaction([
    prisma.compassConversation.update({ where: { id: params.conversationId }, data: { updatedAt: new Date() } }),
    prisma.compassMessage.create({
      data: { conversationId: params.conversationId, role: params.role, content: params.content, structuredData: params.structuredData },
    }),
  ]);
  return toMessageDTO(message);
}

/** Loads a conversation ONLY if it belongs to userId — the WHERE clause
 * itself is the ownership check (Section 23/45: "cross-user conversation"
 * must be rejected). Returns null for both "doesn't exist" and "exists
 * but belongs to someone else" — deliberately indistinguishable to the
 * caller, so a cross-user probe can't be used to enumerate real
 * conversation ids. */
export async function getCompassConversation(userId: string, conversationId: string): Promise<CompassConversationWithMessagesDTO | null> {
  const row = await prisma.compassConversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) return null;
  return { ...toConversationDTO(row), messages: row.messages.map(toMessageDTO) };
}

/** Recent conversations for a user, newest first — for a future history
 * view; not required by Phase 4's own screens but a natural, cheap
 * extension of the same scoped-query pattern. */
export async function listCompassConversations(userId: string, limit = 20): Promise<CompassConversationDTO[]> {
  const rows = await prisma.compassConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map(toConversationDTO);
}
