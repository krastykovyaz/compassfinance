import type { CompassContextType } from "./context";

// Contextual suggested questions (Phase 4, Section 27) — "must be
// CONTEXTUAL, not a generic 'Ask me anything.'" Returns i18n key names
// (translated by the caller via t()), one list per screen/context type.
// Every question here is deliberately phrased so it can never trip the
// no-recommendation policy's input classifier (never "should I", never
// "tell me what to buy") — these are meant to be safe, one-tap sends.

export function getSuggestedQuestionKeys(contextType: CompassContextType): string[] {
  switch (contextType) {
    case "HOME":
      return ["compass.suggestedHome1", "compass.suggestedHome2", "compass.suggestedHome3", "compass.suggestedHome4"];
    case "PORTFOLIO":
      return ["compass.suggestedPortfolio1", "compass.suggestedPortfolio2", "compass.suggestedPortfolio3", "compass.suggestedPortfolio4"];
    case "ASSET":
      return ["compass.suggestedAsset1", "compass.suggestedAsset2", "compass.suggestedAsset3", "compass.suggestedAsset4"];
    case "NEWS":
      return ["compass.suggestedNews1", "compass.suggestedNews2", "compass.suggestedNews3", "compass.suggestedNews4"];
    case "LEARNING":
      return ["compass.suggestedLearning1", "compass.suggestedLearning2", "compass.suggestedLearning3"];
    case "TRADING212_CONNECTION":
    case "IBKR_CONNECTION":
    case "HYPERLIQUID_CONNECTION":
      return ["compass.suggestedConnection1", "compass.suggestedConnection2", "compass.suggestedConnection3", "compass.suggestedConnection4"];
    case "PROFILE":
      return ["compass.suggestedProfile1", "compass.suggestedProfile2", "compass.suggestedProfile3"];
  }
}
