import { describe, expect, it } from "vitest";
import { isStaleNextChunkSrc, looksLikeStaleChunkError } from "./chunk-reload-guard-logic";

describe("looksLikeStaleChunkError", () => {
  it("matches webpack's classic ChunkLoadError name and message", () => {
    expect(looksLikeStaleChunkError("ChunkLoadError")).toBe(true);
    expect(looksLikeStaleChunkError("Loading chunk 42 failed.")).toBe(true);
    expect(looksLikeStaleChunkError("Loading chunk app-layout failed.")).toBe(true);
  });

  it("matches Turbopack/ESM dynamic-import failure phrasing", () => {
    expect(looksLikeStaleChunkError("Failed to fetch dynamically imported module: https://compassfinance.online/_next/static/chunks/1y27wv47_5o-x.js")).toBe(true);
    expect(looksLikeStaleChunkError("Importing a module script failed")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(looksLikeStaleChunkError("chunkloaderror")).toBe(true);
  });

  it("is false for an unrelated error message", () => {
    expect(looksLikeStaleChunkError("TypeError: Cannot read properties of undefined")).toBe(false);
    expect(looksLikeStaleChunkError("Network request failed")).toBe(false);
  });

  it("is false for null/undefined/empty", () => {
    expect(looksLikeStaleChunkError(null)).toBe(false);
    expect(looksLikeStaleChunkError(undefined)).toBe(false);
    expect(looksLikeStaleChunkError("")).toBe(false);
  });
});

describe("isStaleNextChunkSrc", () => {
  it("is true for a Next.js static chunk .js url — the exact live-confirmed failure (nginx logged a 500 for one)", () => {
    expect(isStaleNextChunkSrc("https://compassfinance.online/_next/static/chunks/1y27wv47_5o-x.js")).toBe(true);
    expect(isStaleNextChunkSrc("/_next/static/chunks/main.js")).toBe(true);
  });

  it("is false for a script that isn't a Next.js static chunk", () => {
    expect(isStaleNextChunkSrc("https://example.com/analytics.js")).toBe(false);
    expect(isStaleNextChunkSrc("/_next/static/media/font.woff2")).toBe(false); // not a .js file
  });

  it("is false for null/undefined/empty", () => {
    expect(isStaleNextChunkSrc(null)).toBe(false);
    expect(isStaleNextChunkSrc(undefined)).toBe(false);
    expect(isStaleNextChunkSrc("")).toBe(false);
  });
});
