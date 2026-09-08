import { describe, expect, it } from "vitest";
import { describeTrading212SyncState, classifyTrading212Staleness } from "./sync-state";

const NOW = new Date("2026-09-07T12:00:00.000Z");

describe("describeTrading212SyncState", () => {
  it("never_synced when there's no sync attempt yet", () => {
    expect(
      describeTrading212SyncState({ syncStatus: "NEVER_SYNCED", syncError: null, lastSyncAt: null })
    ).toEqual({ kind: "never_synced" });
  });

  it("syncing while a sync is in progress, regardless of any prior lastSyncAt", () => {
    expect(
      describeTrading212SyncState({ syncStatus: "SYNCING", syncError: null, lastSyncAt: "2026-09-01T00:00:00.000Z" })
    ).toEqual({ kind: "syncing" });
  });

  it("synced with the real lastSyncAt timestamp and a fresh staleness classification", () => {
    expect(
      describeTrading212SyncState({ syncStatus: "SYNCED", syncError: null, lastSyncAt: "2026-09-07T11:50:00.000Z", now: NOW })
    ).toEqual({ kind: "synced", lastSyncAt: "2026-09-07T11:50:00.000Z", staleness: "fresh" });
  });

  it("synced but stale when the last sync is well past the fresh threshold", () => {
    expect(
      describeTrading212SyncState({ syncStatus: "SYNCED", syncError: null, lastSyncAt: "2026-09-07T11:00:00.000Z", now: NOW })
    ).toEqual({ kind: "synced", lastSyncAt: "2026-09-07T11:00:00.000Z", staleness: "stale" });
  });

  it("failed with the stored error message, lastSyncAt preserved, and needsAttention false for a transient failure", () => {
    expect(
      describeTrading212SyncState({
        syncStatus: "FAILED",
        syncError: "Couldn't reach Trading 212",
        lastSyncAt: "2026-09-01T00:00:00.000Z",
        connectionStatus: "CONNECTED",
      })
    ).toEqual({
      kind: "failed",
      message: "Couldn't reach Trading 212",
      lastSyncAt: "2026-09-01T00:00:00.000Z",
      needsAttention: false,
    });
  });

  it("failed with needsAttention true when the connection itself is flagged ERROR (credential failure)", () => {
    const result = describeTrading212SyncState({
      syncStatus: "FAILED",
      syncError: "Trading 212 rejected these credentials",
      lastSyncAt: null,
      connectionStatus: "ERROR",
    });
    expect(result).toMatchObject({ kind: "failed", needsAttention: true });
  });

  it("failed with a safe default message when no syncError was stored", () => {
    expect(describeTrading212SyncState({ syncStatus: "FAILED", syncError: null, lastSyncAt: null })).toEqual({
      kind: "failed",
      message: "Sync failed",
      lastSyncAt: null,
      needsAttention: false,
    });
  });
});

describe("classifyTrading212Staleness", () => {
  it("fresh under 30 minutes", () => {
    expect(classifyTrading212Staleness("2026-09-07T11:31:00.000Z", NOW)).toBe("fresh");
  });
  it("stale between 30 and 120 minutes", () => {
    expect(classifyTrading212Staleness("2026-09-07T10:30:00.000Z", NOW)).toBe("stale");
  });
  it("very_stale beyond 120 minutes", () => {
    expect(classifyTrading212Staleness("2026-09-07T09:00:00.000Z", NOW)).toBe("very_stale");
  });
});
