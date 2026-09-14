import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type AnyRow = Record<string, unknown>;

const { conversations, messages, prismaMock } = vi.hoisted(() => {
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

  const conversations: AnyRow[] = [];
  const messages: AnyRow[] = [];

  const compassConversation = {
    create: async ({ data, include }: { data: AnyRow; include?: AnyRow }) => {
      const now = new Date();
      const row: AnyRow = {
        id: genId("conv"),
        userId: data.userId,
        contextType: data.contextType,
        contextKey: data.contextKey ?? null,
        createdAt: now,
        updatedAt: now,
      };
      conversations.push(row);
      const nested = (data.messages as { create: AnyRow[] } | undefined)?.create ?? [];
      for (const m of nested) {
        messages.push({ id: genId("msg"), conversationId: row.id, role: m.role, content: m.content, structuredData: m.structuredData ?? null, createdAt: new Date() });
      }
      if (include?.messages) {
        return { ...row, messages: messages.filter((m) => m.conversationId === row.id) };
      }
      return row;
    },
    update: async ({ where, data }: { where: AnyRow; data: AnyRow }) => {
      const row = conversations.find((c) => c.id === where.id);
      if (!row) throw new Error("not found");
      if (data.updatedAt) row.updatedAt = data.updatedAt;
      return row;
    },
    findFirst: async ({ where, include }: { where: AnyRow; include?: AnyRow }) => {
      const row = conversations.find((c) => c.id === where.id && c.userId === where.userId);
      if (!row) return null;
      if (include?.messages) {
        return { ...row, messages: messages.filter((m) => m.conversationId === row.id).sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()) };
      }
      return row;
    },
    findMany: async ({ where, orderBy, take }: { where: AnyRow; orderBy?: AnyRow; take?: number }) => {
      let result = conversations.filter((c) => c.userId === where.userId);
      if (orderBy) {
        const [field] = Object.keys(orderBy);
        const dir = orderBy[field] === "desc" ? -1 : 1;
        result = [...result].sort((a, b) => {
          const av = (a[field] as Date).getTime();
          const bv = (b[field] as Date).getTime();
          return av > bv ? dir : av < bv ? -dir : 0;
        });
      }
      return take ? result.slice(0, take) : result;
    },
  };

  const compassMessage = {
    create: async ({ data }: { data: AnyRow }) => {
      const row: AnyRow = { id: genId("msg"), conversationId: data.conversationId, role: data.role, content: data.content, structuredData: data.structuredData ?? null, createdAt: new Date() };
      messages.push(row);
      return row;
    },
  };

  const prismaMock = {
    compassConversation,
    compassMessage,
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return { conversations, messages, prismaMock };
});

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));

import { createCompassConversation, appendCompassMessage, getCompassConversation, listCompassConversations } from "./compass-conversation-repository";

beforeEach(() => {
  conversations.length = 0;
  messages.length = 0;
});

describe("createCompassConversation", () => {
  it("creates a conversation scoped to userId with its first message attached", async () => {
    const result = await createCompassConversation({
      userId: "u1",
      context: { type: "PORTFOLIO", source: "TRADING212" },
      firstMessage: { role: "user", content: "How is my portfolio?", structuredData: null },
    });
    expect(result.userId).toBe("u1");
    expect(result.context).toEqual({ type: "PORTFOLIO", source: "TRADING212" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ role: "user", content: "How is my portfolio?" });
  });

  it("round-trips every context type through encode/decode", async () => {
    const contexts: Array<{ type: string } & Record<string, unknown>> = [
      { type: "HOME" },
      { type: "ASSET", assetId: "nvda" },
      { type: "NEWS", articleId: "n1" },
      { type: "LEARNING", assetId: "nvda", lessonId: "l1" },
      { type: "LEARNING", assetId: "nvda", lessonId: null },
    ];
    for (const context of contexts) {
      const result = await createCompassConversation({
        userId: "u1",
        context: context as never,
        firstMessage: { role: "user", content: "x", structuredData: null },
      });
      expect(result.context).toEqual(context);
    }
  });
});

describe("appendCompassMessage + getCompassConversation", () => {
  it("appends a message and bumps the conversation's updatedAt", async () => {
    const created = await createCompassConversation({ userId: "u1", context: { type: "HOME" }, firstMessage: { role: "user", content: "Hi", structuredData: null } });
    const beforeUpdate = conversations.find((c) => c.id === created.id)!.updatedAt as Date;

    await new Promise((r) => setTimeout(r, 2));
    await appendCompassMessage({ conversationId: created.id, role: "assistant", content: "Here's your summary.", structuredData: '{"blocks":[]}' });

    const afterUpdate = conversations.find((c) => c.id === created.id)!.updatedAt as Date;
    expect(afterUpdate.getTime()).toBeGreaterThan(beforeUpdate.getTime());

    const loaded = await getCompassConversation("u1", created.id);
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[1]).toMatchObject({ role: "assistant", content: "Here's your summary.", structuredData: '{"blocks":[]}' });
  });

  it("returns messages in creation order", async () => {
    const created = await createCompassConversation({ userId: "u1", context: { type: "HOME" }, firstMessage: { role: "user", content: "first", structuredData: null } });
    await appendCompassMessage({ conversationId: created.id, role: "assistant", content: "second", structuredData: null });
    await appendCompassMessage({ conversationId: created.id, role: "user", content: "third", structuredData: null });
    const loaded = await getCompassConversation("u1", created.id);
    expect(loaded?.messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });
});

describe("getCompassConversation — user isolation (Section 23/45)", () => {
  it("returns null for a conversation owned by a different user, indistinguishable from not-found", async () => {
    const created = await createCompassConversation({ userId: "owner", context: { type: "HOME" }, firstMessage: { role: "user", content: "private", structuredData: null } });

    const asAttacker = await getCompassConversation("attacker", created.id);
    const bogusId = await getCompassConversation("attacker", "does-not-exist");

    expect(asAttacker).toBeNull();
    expect(bogusId).toBeNull();
  });

  it("returns the conversation for its real owner", async () => {
    const created = await createCompassConversation({ userId: "owner", context: { type: "HOME" }, firstMessage: { role: "user", content: "private", structuredData: null } });
    const loaded = await getCompassConversation("owner", created.id);
    expect(loaded?.id).toBe(created.id);
  });
});

describe("listCompassConversations", () => {
  it("only lists the given user's own conversations, newest first", async () => {
    const c1 = await createCompassConversation({ userId: "u1", context: { type: "HOME" }, firstMessage: { role: "user", content: "a", structuredData: null } });
    await new Promise((r) => setTimeout(r, 2));
    const c2 = await createCompassConversation({ userId: "u1", context: { type: "HOME" }, firstMessage: { role: "user", content: "b", structuredData: null } });
    await createCompassConversation({ userId: "u2", context: { type: "HOME" }, firstMessage: { role: "user", content: "other user", structuredData: null } });

    const list = await listCompassConversations("u1");
    expect(list.map((c) => c.id)).toEqual([c2.id, c1.id]);
  });
});
