import { describe, expect, it } from "vitest";
import { formatEnabledChannelsSummary } from "./format-channel-summary";

const LABELS = { push: "Push", email: "Email" };

describe("formatEnabledChannelsSummary — real Profile summary, never a hardcoded string", () => {
  it("shows both channels, comma-joined, second one lowercased", () => {
    expect(formatEnabledChannelsSummary({ push: true, email: true }, LABELS)).toBe(
      "Push, email"
    );
  });

  it("shows just push when only push is enabled", () => {
    expect(formatEnabledChannelsSummary({ push: true, email: false }, LABELS)).toBe("Push");
  });

  it("shows just email when only email is enabled", () => {
    expect(formatEnabledChannelsSummary({ push: false, email: true }, LABELS)).toBe("Email");
  });

  it("returns null when neither channel is enabled — caller supplies the Off fallback", () => {
    expect(formatEnabledChannelsSummary({ push: false, email: false }, LABELS)).toBeNull();
  });
});
