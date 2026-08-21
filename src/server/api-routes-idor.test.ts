import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const API_USER_ROOT = join(__dirname, "../app/api/user");
const API_ME_ROUTE = join(__dirname, "../app/api/me/route.ts");

function findRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findRouteFiles(full));
    } else if (entry === "route.ts") {
      files.push(full);
    }
  }
  return files;
}

// Patterns that would indicate a route is trusting client-supplied
// identity instead of the session — exactly what Milestone 12 Section 6/8
// call out ("Do NOT trust a userId sent by the browser").
const FORBIDDEN_PATTERNS = [
  /body\.userId/,
  /body\?\.userId/,
  /searchParams\.get\(\s*["']userId["']\s*\)/,
  /req\.query\.userId/,
  /params\.userId/, // a route param named userId would be an equally direct IDOR vector
];

describe("user-data API routes never trust a client-supplied userId (Milestone 12, Section 6/8)", () => {
  const routeFiles = [...findRouteFiles(API_USER_ROOT), API_ME_ROUTE];

  it("found every expected route file (sanity check that the scan itself isn't silently empty)", () => {
    // If this drops below the current count, either a route was deleted
    // (fine, update the number) or the directory scan broke (not fine) —
    // either way it should be a visible, deliberate change, not silent.
    expect(routeFiles.length).toBeGreaterThanOrEqual(13);
  });

  it.each(routeFiles)("%s derives its user id from requireUserId()", (file) => {
    const source = readFileSync(file, "utf8");
    const hasExport = /export async function (GET|POST|PATCH|DELETE|PUT)/.test(source);
    if (!hasExport) return; // shouldn't happen, but don't false-fail on an empty/odd file
    expect(source).toMatch(/requireUserId\(\)/);
  });

  it.each(routeFiles)("%s contains no client-supplied-userId pattern", (file) => {
    const source = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });
});
