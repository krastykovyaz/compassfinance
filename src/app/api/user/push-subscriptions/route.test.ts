import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/server/auth/session", () => ({
  requireUserId: (...args: unknown[]) => requireUserId(...args),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

const upsertPushSubscription = vi.fn();
const deletePushSubscription = vi.fn();
const listPushSubscriptionsForUser = vi.fn();
vi.mock("@/server/repositories/notifications-repository", () => ({
  upsertPushSubscription: (...args: unknown[]) => upsertPushSubscription(...args),
  deletePushSubscription: (...args: unknown[]) => deletePushSubscription(...args),
  listPushSubscriptionsForUser: (...args: unknown[]) => listPushSubscriptionsForUser(...args),
}));

import { POST, DELETE } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/user/push-subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(body: unknown) {
  return new Request("http://localhost/api/user/push-subscriptions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserId.mockResolvedValue("user-1");
});

describe("POST /api/user/push-subscriptions", () => {
  it("persists a subscription scoped to the authenticated user", async () => {
    const res = await POST(
      postRequest({ endpoint: "https://push/ep1", keys: { p256dh: "k", auth: "a" } })
    );
    expect(res.status).toBe(200);
    expect(upsertPushSubscription).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ endpoint: "https://push/ep1", p256dh: "k", auth: "a" })
    );
  });

  it("rejects a malformed body", async () => {
    const res = await POST(postRequest({ endpoint: "https://push/ep1" }));
    expect(res.status).toBe(400);
    expect(upsertPushSubscription).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/user/push-subscriptions", () => {
  it("removes an endpoint that belongs to the authenticated user", async () => {
    listPushSubscriptionsForUser.mockResolvedValue([
      { id: "s1", userId: "user-1", endpoint: "https://push/ep1", p256dh: "k", auth: "a" },
    ]);
    const res = await DELETE(deleteRequest({ endpoint: "https://push/ep1" }));
    expect(res.status).toBe(200);
    expect(deletePushSubscription).toHaveBeenCalledWith("https://push/ep1");
  });

  it("never deletes an endpoint belonging to another user", async () => {
    listPushSubscriptionsForUser.mockResolvedValue([
      { id: "s2", userId: "user-1", endpoint: "https://push/mine", p256dh: "k", auth: "a" },
    ]);
    const res = await DELETE(deleteRequest({ endpoint: "https://push/someone-elses" }));
    expect(res.status).toBe(200);
    expect(deletePushSubscription).not.toHaveBeenCalled();
  });
});
