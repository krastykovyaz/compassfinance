// Centralized content registry — the single place every screen and future
// tool (the /learn page, the generic lesson engine, an eventual LLM
// pipeline) reads asset learning content from. Nothing here is hardcoded
// into a React component; components only ever import from this file.

import { AssetLearningPath } from "./types";
import { sp500LearningPath } from "./sp500";
import { nasdaqLearningPath } from "./nasdaq";
import { aaplLearningPath } from "./aapl";
import { nvdaLearningPath } from "./nvda";
import { tslaLearningPath } from "./tsla";
import { msftLearningPath } from "./msft";
import { amznLearningPath } from "./amzn";
import { googlLearningPath } from "./googl";
import { metaLearningPath } from "./meta";
import { goldLearningPath } from "./gold";
import { brentOilLearningPath } from "./brent-oil";
import { btcLearningPath } from "./btc";
import { ethLearningPath } from "./eth";

export const ALL_ASSET_LEARNING_PATHS: Record<string, AssetLearningPath> = {
  sp500: sp500LearningPath,
  nasdaq: nasdaqLearningPath,
  aapl: aaplLearningPath,
  nvda: nvdaLearningPath,
  tsla: tslaLearningPath,
  msft: msftLearningPath,
  amzn: amznLearningPath,
  googl: googlLearningPath,
  meta: metaLearningPath,
  gold: goldLearningPath,
  "brent-oil": brentOilLearningPath,
  btc: btcLearningPath,
  eth: ethLearningPath,
};

/** Stable display order — indices, then stocks, then commodities, then crypto. */
export const ASSET_LEARNING_PATH_ORDER: string[] = [
  "sp500",
  "nasdaq",
  "aapl",
  "nvda",
  "tsla",
  "msft",
  "amzn",
  "googl",
  "meta",
  "gold",
  "brent-oil",
  "btc",
  "eth",
];

export function getAssetLearningPath(assetId: string): AssetLearningPath | undefined {
  return ALL_ASSET_LEARNING_PATHS[assetId];
}

export * from "./types";
