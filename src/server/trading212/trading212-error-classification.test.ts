import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyFetchReason,
  classifyThrownError,
  isCredentialInvalidatingCategory,
} from "./trading212-error-classification";

describe("classifyFetchReason", () => {
  it("maps unauthorized to AUTHENTICATION", () => {
    expect(classifyFetchReason("unauthorized")).toBe("AUTHENTICATION");
  });
  it("maps rate_limited to RATE_LIMIT", () => {
    expect(classifyFetchReason("rate_limited")).toBe("RATE_LIMIT");
  });
  it("maps network_error to NETWORK", () => {
    expect(classifyFetchReason("network_error")).toBe("NETWORK");
  });
  it("maps provider_error to PROVIDER_ERROR", () => {
    expect(classifyFetchReason("provider_error")).toBe("PROVIDER_ERROR");
  });
  it("maps malformed_response to INVALID_RESPONSE", () => {
    expect(classifyFetchReason("malformed_response")).toBe("INVALID_RESPONSE");
  });
});

describe("classifyThrownError", () => {
  it("always returns INTERNAL for an unexpected thrown error", () => {
    expect(classifyThrownError()).toBe("INTERNAL");
  });
});

describe("isCredentialInvalidatingCategory", () => {
  it("only AUTHENTICATION and PERMISSION invalidate the connection", () => {
    expect(isCredentialInvalidatingCategory("AUTHENTICATION")).toBe(true);
    expect(isCredentialInvalidatingCategory("PERMISSION")).toBe(true);
  });

  it("every transient/environmental category never invalidates the connection", () => {
    expect(isCredentialInvalidatingCategory("RATE_LIMIT")).toBe(false);
    expect(isCredentialInvalidatingCategory("NETWORK")).toBe(false);
    expect(isCredentialInvalidatingCategory("PROVIDER_ERROR")).toBe(false);
    expect(isCredentialInvalidatingCategory("INVALID_RESPONSE")).toBe(false);
    expect(isCredentialInvalidatingCategory("INTERNAL")).toBe(false);
  });
});
