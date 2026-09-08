import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runTrading212AutoSyncCycle = vi.fn();
vi.mock("@/server/trading212/trading212-scheduler", () => ({
  runTrading212AutoSyncCycle: (...args: unknown[]) => runTrading212AutoSyncCycle(...args),
}));

const getTrading212CronSecret = vi.fn();
vi.mock("@/server/trading212/trading212-sync-config", () => ({
  getTrading212CronSecret: () => getTrading212CronSecret(),
}));

import { POST } from "./route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/cron/trading212-sync", { method: "POST", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  getTrading212CronSecret.mockReturnValue("real-secret");
  runTrading212AutoSyncCycle.mockResolvedValue({ eligible: 0, synced: 0, failed: 0, alreadySyncing: 0 });
});

describe("POST /api/cron/trading212-sync — security (Requirement 19)", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(runTrading212AutoSyncCycle).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const res = await POST(request({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(runTrading212AutoSyncCycle).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header (no Bearer prefix)", async () => {
    const res = await POST(request({ authorization: "real-secret" }));
    expect(res.status).toBe(401);
  });

  it("fails closed when no secret is configured at all — never silently open", async () => {
    getTrading212CronSecret.mockReturnValue(null);
    const res = await POST(request({ authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
    expect(runTrading212AutoSyncCycle).not.toHaveBeenCalled();
  });

  it("accepts a request with the correct secret and runs the cycle", async () => {
    const res = await POST(request({ authorization: "Bearer real-secret" }));
    expect(res.status).toBe(200);
    expect(runTrading212AutoSyncCycle).toHaveBeenCalledTimes(1);
  });

  it("never echoes the secret or any credential-shaped value back in the response", async () => {
    const res = await POST(request({ authorization: "Bearer real-secret" }));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("real-secret");
  });

  it("returns the scheduler's structured cycle result", async () => {
    runTrading212AutoSyncCycle.mockResolvedValue({ eligible: 5, synced: 4, failed: 1, alreadySyncing: 0 });

    const res = await POST(request({ authorization: "Bearer real-secret" }));
    const body = await res.json();

    expect(body).toEqual({ eligible: 5, synced: 4, failed: 1, alreadySyncing: 0 });
  });
});
