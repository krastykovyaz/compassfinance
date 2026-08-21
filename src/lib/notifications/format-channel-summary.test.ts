import { describe, expect, it } from "vitest";
import { formatEnabledChannelsSummary } from "./format-channel-summary";

const LABELS = { push: "Push" };

describe("formatEnabledChannelsSummary — real Profile summary, never a hardcoded string", () => {
  it("shows push when enabled", () => {
    expect(formatEnabledChannelsSummary({ push: true }, LABELS)).toBe("Push");
  });

  it("returns null when push is disabled — caller supplies the Off fallback", () => {
    expect(formatEnabledChannelsSummary({ push: false }, LABELS)).toBeNull();
  });
});
