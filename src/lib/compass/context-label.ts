import type { CompassContext, PortfolioContextSource } from "./context";

// Builds the context badge text (Phase 4, Section 28's worked examples:
// "Context: Portfolio · Trading 212", "Context: News · NVIDIA",
// "Context: Learning · Risk Management"). The i18n dictionary supplies
// the translated PREFIX (e.g. t("compass.contextPortfolio")); this
// function only decides which prefix key applies and what (if any)
// untranslated dynamic suffix (an asset name, a source label key) to
// append — kept pure/testable, same split as suggested-questions.ts.

export type ContextLabelParts = {
  /** i18n key for the translated prefix, e.g. "compass.contextPortfolio". */
  prefixKey: string;
  /** i18n key for a translated suffix (a source name), when the suffix is
   * itself one of the fixed portfolio sources rather than free-form data. */
  suffixKey?: string;
  /** A literal, untranslated suffix (an asset symbol, an article title) —
   * real user/catalog data, not UI copy, so it's never looked up in the
   * dictionary. */
  suffixText?: string;
};

const PORTFOLIO_SOURCE_KEY: Record<PortfolioContextSource, string> = {
  ALL: "compass.sourceLabelAll",
  PAPER: "compass.sourceLabelPaper",
  TRADING212: "compass.sourceLabelTrading212",
  IBKR: "compass.sourceLabelIbkr",
  HYPERLIQUID: "compass.sourceLabelHyperliquid",
};

export function buildContextLabelParts(context: CompassContext, opts?: { assetName?: string; articleTitle?: string; lessonTitle?: string }): ContextLabelParts {
  switch (context.type) {
    case "HOME":
      return { prefixKey: "compass.contextHome" };
    case "PROFILE":
      return { prefixKey: "compass.contextProfile" };
    case "PORTFOLIO":
      return { prefixKey: "compass.contextPortfolio", suffixKey: PORTFOLIO_SOURCE_KEY[context.source] };
    case "ASSET":
      return { prefixKey: "compass.contextAsset", suffixText: opts?.assetName };
    case "NEWS":
      return { prefixKey: "compass.contextNews", suffixText: opts?.articleTitle };
    case "LEARNING":
      return { prefixKey: "compass.contextLearning", suffixText: opts?.lessonTitle };
    case "TRADING212_CONNECTION":
      return { prefixKey: "compass.contextTrading212Connection" };
    case "IBKR_CONNECTION":
      return { prefixKey: "compass.contextIbkrConnection" };
    case "HYPERLIQUID_CONNECTION":
      return { prefixKey: "compass.contextHyperliquidConnection" };
  }
}
