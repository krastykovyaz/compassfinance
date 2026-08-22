// Pure calculation/validation logic for the Hyperliquid Trading Phase 3
// order-preview flow. No fetch, no wallet, no React — every function here
// is a plain, directly-testable function of its inputs, matching this
// codebase's established pattern for otherwise-untestable UI logic (see
// getWalletLinkPayload in wallet-link-sync.tsx, resolveHyperliquidPanelView
// in hyperliquid-account-panel.tsx).
//
// This module NEVER calls the network and NEVER produces anything that
// could be submitted as a real order — there is no signing, no order
// payload, no Hyperliquid "exchange" (write) endpoint reference anywhere
// in this file, only arithmetic over numbers already on screen. See
// no-private-key-exposure.test.ts, which this file is included in.

export type PerpSide = "long" | "short";

export type PerpOrderValidationError =
  | "invalid-amount"
  | "invalid-leverage"
  | "leverage-exceeds-max"
  | "insufficient-balance"
  | "price-unavailable";

export type PerpOrderPreview = {
  side: PerpSide;
  marginUsdc: number;
  leverage: number;
  entryPrice: number;
  /** marginUsdc * leverage — the position's notional (contract) value. */
  notionalValue: number;
  /** notionalValue / entryPrice — approximate size in the underlying asset. */
  estimatedUnits: number;
  /** notionalValue * TAKER_FEE_RATE — an estimate of Hyperliquid's base
   * taker fee. Real fees depend on the account's 30-day volume tier and
   * maker/taker rebates, which this app has no way to look up without a
   * signed, user-specific request — so this is a labeled approximation,
   * not a quote. */
  estimatedFee: number;
  /** null only when the inputs can't produce one (should not happen once
   * validation has passed) — otherwise always a concrete estimate. */
  liquidationPrice: number | null;
  maintenanceMarginRate: number;
};

export type BuildPerpOrderPreviewResult =
  | { status: "ok"; preview: PerpOrderPreview }
  | { status: "invalid"; error: PerpOrderValidationError };

export type PerpOrderPreviewInput = {
  side: PerpSide;
  marginUsdc: number;
  leverage: number;
  entryPrice: number | null;
  maxLeverage: number;
  availableBalance: number;
};

// Hyperliquid's published base taker rate as of this writing (0.045%).
// This is the standard/lowest volume tier's rate, used here only as a
// clearly-labeled estimate for a preview that submits nothing.
export const TAKER_FEE_RATE = 0.00045;

export function calculateNotionalValue(marginUsdc: number, leverage: number): number {
  return marginUsdc * leverage;
}

export function calculateEstimatedUnits(notionalValue: number, entryPrice: number): number {
  if (entryPrice <= 0) return 0;
  return notionalValue / entryPrice;
}

export function calculateEstimatedFee(notionalValue: number, feeRate: number = TAKER_FEE_RATE): number {
  return notionalValue * feeRate;
}

/**
 * Estimated isolated-margin liquidation price. Not Hyperliquid's exact
 * tiered-margin formula (this repo has no access to their maintenance-
 * margin tier table without an authenticated, signed request) — this is
 * the standard simplified approximation used by most perpetual venues for
 * a preview: maintenance margin ≈ half of the position's max initial
 * margin rate (1 / (2 * maxLeverage)), applied against the requested
 * leverage's entry.
 *
 * long:  entryPrice * (1 - 1/leverage + maintenanceMarginRate), floored at 0
 * short: entryPrice * (1 + 1/leverage - maintenanceMarginRate)
 */
export function calculateLiquidationPrice(params: {
  side: PerpSide;
  entryPrice: number;
  leverage: number;
  maxLeverage: number;
}): number | null {
  const { side, entryPrice, leverage, maxLeverage } = params;
  if (entryPrice <= 0 || leverage <= 0 || maxLeverage <= 0) return null;

  const maintenanceMarginRate = 1 / (2 * maxLeverage);
  const initialMarginRate = 1 / leverage;

  if (side === "long") {
    return Math.max(0, entryPrice * (1 - initialMarginRate + maintenanceMarginRate));
  }
  return entryPrice * (1 + initialMarginRate - maintenanceMarginRate);
}

export function maintenanceMarginRateFor(maxLeverage: number): number {
  return maxLeverage > 0 ? 1 / (2 * maxLeverage) : 0;
}

/** Returns the first validation failure, or null if the input is valid. */
export function validatePerpOrderInput(input: PerpOrderPreviewInput): PerpOrderValidationError | null {
  const { marginUsdc, leverage, entryPrice, maxLeverage, availableBalance } = input;

  if (entryPrice === null || !Number.isFinite(entryPrice) || entryPrice <= 0) return "price-unavailable";
  if (!Number.isFinite(marginUsdc) || marginUsdc <= 0) return "invalid-amount";
  if (!Number.isFinite(leverage) || leverage < 1) return "invalid-leverage";
  if (leverage > maxLeverage) return "leverage-exceeds-max";
  if (marginUsdc > availableBalance) return "insufficient-balance";
  return null;
}

/** The single entry point the UI calls: validates, then builds the full
 * preview. Never partially computes a preview for invalid input. */
export function buildPerpOrderPreview(input: PerpOrderPreviewInput): BuildPerpOrderPreviewResult {
  const error = validatePerpOrderInput(input);
  if (error) return { status: "invalid", error };

  // entryPrice is guaranteed non-null and > 0 past validation.
  const entryPrice = input.entryPrice as number;
  const notionalValue = calculateNotionalValue(input.marginUsdc, input.leverage);

  return {
    status: "ok",
    preview: {
      side: input.side,
      marginUsdc: input.marginUsdc,
      leverage: input.leverage,
      entryPrice,
      notionalValue,
      estimatedUnits: calculateEstimatedUnits(notionalValue, entryPrice),
      estimatedFee: calculateEstimatedFee(notionalValue),
      liquidationPrice: calculateLiquidationPrice({
        side: input.side,
        entryPrice,
        leverage: input.leverage,
        maxLeverage: input.maxLeverage,
      }),
      maintenanceMarginRate: maintenanceMarginRateFor(input.maxLeverage),
    },
  };
}
