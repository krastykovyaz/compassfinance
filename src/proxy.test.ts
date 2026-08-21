import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import proxy from "../proxy";

describe("proxy — guest mode (Milestone 12, Section 7)", () => {
  it("never redirects — the app must not force authentication globally", () => {
    const response = proxy();
    expect(response.status).toBe(200);
    // NextResponse.next() carries this header internally; a redirect
    // response would instead have a 3xx status and a Location header.
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not import or invoke auth()/Prisma at all", () => {
    // Enforced by construction: proxy.ts has no `@/auth` import, so this
    // file itself never needs a generated Prisma client to run — that's
    // exactly what makes the whole app resilient to a missing AUTH_SECRET
    // instead of every route 500-ing.
    const source = readFileSync(join(__dirname, "../proxy.ts"), "utf8");
    expect(source).not.toMatch(/from ["']@\/auth["']/);
  });
});

describe("proxy — referral code capture (Milestone 24)", () => {
  it("sets the referral cookie when visiting /invite/<code>, still without redirecting", () => {
    const request = new NextRequest("https://compass.app/invite/ABC12345");
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    const cookie = response.cookies.get("compass_referral_code");
    expect(cookie?.value).toBe("ABC12345");
  });

  it("never sets the referral cookie on an unrelated route", () => {
    const request = new NextRequest("https://compass.app/markets");
    const response = proxy(request);
    expect(response.cookies.get("compass_referral_code")).toBeUndefined();
  });

  it("ignores a malformed /invite path rather than setting a bogus cookie", () => {
    const request = new NextRequest("https://compass.app/invite/");
    const response = proxy(request);
    expect(response.cookies.get("compass_referral_code")).toBeUndefined();
  });
});
