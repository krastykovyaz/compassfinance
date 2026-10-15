import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const updateMany = vi.fn();
vi.mock("@/server/db/prisma", () => ({
  prisma: { brokerageConnection: { updateMany: (...args: unknown[]) => updateMany(...args) } },
}));

import { releaseSyncLockAsFailed } from "./sync-lock";

const PARAMS = { syncError: "boom", lastFailedSyncAt: new Date("2026-10-03T12:00:00.000Z"), needsAttention: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("releaseSyncLockAsFailed", () => {
  it("marks the connection FAILED and records the error", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await releaseSyncLockAsFailed("conn-1", PARAMS);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: { syncStatus: "FAILED", syncError: "boom", lastFailedSyncAt: PARAMS.lastFailedSyncAt },
    });
  });

  it("also flags the connection as needing attention when the credentials themselves were rejected", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await releaseSyncLockAsFailed("conn-1", { ...PARAMS, needsAttention: true });

    expect(updateMany.mock.calls[0][0].data.status).toBe("ERROR");
  });

  it("is a quiet no-op when the connection was deleted mid-sync (a disconnect racing a failing sync)", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(releaseSyncLockAsFailed("gone", PARAMS)).resolves.toBeUndefined();
  });

  it("lets a real database error through, so the caller knows the failure was NOT recorded", async () => {
    updateMany.mockRejectedValue(new Error("SQLITE_BUSY: database is locked"));

    await expect(releaseSyncLockAsFailed("conn-1", PARAMS)).rejects.toThrow("SQLITE_BUSY");
  });

  it("swallows that same error only when asked to (the caller's last-resort path)", async () => {
    updateMany.mockRejectedValue(new Error("SQLITE_BUSY: database is locked"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(releaseSyncLockAsFailed("conn-1", PARAMS, { bestEffort: true })).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
