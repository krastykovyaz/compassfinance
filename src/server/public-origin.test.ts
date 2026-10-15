import { afterEach, describe, expect, it, vi } from "vitest";
import { publicUrl } from "./public-origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicUrl", () => {
  it("uses the origin of AUTH_URL, ignoring the server's own address on the request", () => {
    vi.stubEnv("AUTH_URL", "https://compassfinance.online/api/auth");
    const url = publicUrl("/profile/connected-accounts?ibkr=error", { url: "https://localhost:3002/api/x" });
    expect(url.toString()).toBe("https://compassfinance.online/profile/connected-accounts?ibkr=error");
  });

  it("drops the path AUTH_URL carries (Auth.js keeps its base path there)", () => {
    vi.stubEnv("AUTH_URL", "https://compassfinance.online/api/auth");
    expect(publicUrl("/signin", { url: "http://localhost:3002/" }).pathname).toBe("/signin");
  });

  it("falls back to the request's own URL when AUTH_URL is not set (local development)", () => {
    vi.stubEnv("AUTH_URL", "");
    expect(publicUrl("/signin", { url: "http://localhost:3000/api/x" }).toString()).toBe("http://localhost:3000/signin");
  });

  it("falls back to the request's own URL when AUTH_URL is malformed, instead of throwing", () => {
    vi.stubEnv("AUTH_URL", "not a url");
    expect(publicUrl("/signin", { url: "http://localhost:3000/api/x" }).toString()).toBe("http://localhost:3000/signin");
  });
});
