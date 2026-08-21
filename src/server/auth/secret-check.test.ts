import { describe, expect, it } from "vitest";
import { assertProductionSecret } from "./secret-check";

describe("assertProductionSecret", () => {
  it("throws a clear, actionable error in production when AUTH_SECRET is missing", () => {
    expect(() => assertProductionSecret("production", undefined)).toThrow(/AUTH_SECRET/);
  });

  it("throws when AUTH_SECRET is an empty string in production", () => {
    expect(() => assertProductionSecret("production", "")).toThrow(/AUTH_SECRET/);
  });

  it("does not throw in production when AUTH_SECRET is set", () => {
    expect(() => assertProductionSecret("production", "a-real-secret-value")).not.toThrow();
  });

  it("does not throw in development even without AUTH_SECRET — guest mode must keep working", () => {
    expect(() => assertProductionSecret("development", undefined)).not.toThrow();
  });

  it("does not throw when NODE_ENV is unset (e.g. some test runners)", () => {
    expect(() => assertProductionSecret(undefined, undefined)).not.toThrow();
  });
});
