import { describe, expect, it, vi } from "vitest";

// session.ts is server-only; the route tests mock it the same way.
vi.mock("@/server/auth/session", () => ({
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

import { ApiError, withApiErrorHandling } from "./api-helpers";
import { UnauthenticatedError } from "@/server/auth/session";

describe("withApiErrorHandling", () => {
  it("returns the handler's data as JSON", async () => {
    const res = await withApiErrorHandling(async () => ({ a: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("maps UnauthenticatedError to 401", async () => {
    const res = await withApiErrorHandling(async () => {
      throw new UnauthenticatedError();
    });
    expect(res.status).toBe(401);
  });

  it("sends an ApiError's own message and status (400 by default)", async () => {
    const res = await withApiErrorHandling(async () => {
      throw new ApiError("assetId is required");
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "assetId is required" });

    const limited = await withApiErrorHandling(async () => {
      throw new ApiError("Too many requests", 429);
    });
    expect(limited.status).toBe(429);
  });

  it("never forwards the text of any other error: generic 500, detail only in the server log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await withApiErrorHandling(async () => {
      throw new Error('Invalid `prisma.brokerageConnection.upsert()` invocation: encryptedApiKey: "abc"');
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Something went wrong. Please try again.");
    expect(JSON.stringify(body)).not.toContain("prisma");
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][1])).toContain("prisma.brokerageConnection");
    log.mockRestore();
  });

  it("handles a non-Error throw the same way", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await withApiErrorHandling(async () => {
      throw "boom";
    });
    expect(res.status).toBe(500);
    log.mockRestore();
  });
});
