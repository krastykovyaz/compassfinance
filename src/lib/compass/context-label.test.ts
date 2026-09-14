import { describe, expect, it } from "vitest";
import { buildContextLabelParts } from "./context-label";

describe("buildContextLabelParts", () => {
  it("HOME/PROFILE/connection contexts have only a prefix, no suffix", () => {
    expect(buildContextLabelParts({ type: "HOME" })).toEqual({ prefixKey: "compass.contextHome" });
    expect(buildContextLabelParts({ type: "PROFILE" })).toEqual({ prefixKey: "compass.contextProfile" });
    expect(buildContextLabelParts({ type: "TRADING212_CONNECTION" })).toEqual({ prefixKey: "compass.contextTrading212Connection" });
  });

  it("PORTFOLIO carries a translated source suffix key matching the given source (Section 28's 'Portfolio · Trading 212' example)", () => {
    expect(buildContextLabelParts({ type: "PORTFOLIO", source: "TRADING212" })).toEqual({ prefixKey: "compass.contextPortfolio", suffixKey: "compass.sourceLabelTrading212" });
    expect(buildContextLabelParts({ type: "PORTFOLIO", source: "ALL" })).toEqual({ prefixKey: "compass.contextPortfolio", suffixKey: "compass.sourceLabelAll" });
    expect(buildContextLabelParts({ type: "PORTFOLIO", source: "HYPERLIQUID" })).toEqual({ prefixKey: "compass.contextPortfolio", suffixKey: "compass.sourceLabelHyperliquid" });
  });

  it("ASSET/NEWS/LEARNING carry a literal dynamic suffix, never looked up as a translation key (Section 28's 'News · NVIDIA' example)", () => {
    expect(buildContextLabelParts({ type: "ASSET", assetId: "nvda" }, { assetName: "NVIDIA" })).toEqual({ prefixKey: "compass.contextAsset", suffixText: "NVIDIA" });
    expect(buildContextLabelParts({ type: "NEWS", articleId: "n1" }, { articleTitle: "NVIDIA announces new chips" })).toEqual({ prefixKey: "compass.contextNews", suffixText: "NVIDIA announces new chips" });
    expect(buildContextLabelParts({ type: "LEARNING", assetId: "nvda", lessonId: "l1" }, { lessonTitle: "Risk Management" })).toEqual({ prefixKey: "compass.contextLearning", suffixText: "Risk Management" });
  });

  it("ASSET/NEWS/LEARNING without opts have an undefined suffix rather than a fabricated placeholder", () => {
    expect(buildContextLabelParts({ type: "ASSET", assetId: "nvda" }).suffixText).toBeUndefined();
  });
});
