import { describe, expect, it } from "vitest";
import {
  buildPerpOrderPreview,
  calculateEstimatedFee,
  calculateEstimatedUnits,
  calculateLiquidationPrice,
  calculateNotionalValue,
  maintenanceMarginRateFor,
  validatePerpOrderInput,
  TAKER_FEE_RATE,
  type PerpOrderPreviewInput,
} from "./perp-order-calculator";

const BASE: PerpOrderPreviewInput = {
  side: "long",
  marginUsdc: 100,
  leverage: 5,
  entryPrice: 60000,
  maxLeverage: 50,
  availableBalance: 1000,
};

describe("calculateNotionalValue", () => {
  it("multiplies margin by leverage", () => {
    expect(calculateNotionalValue(100, 5)).toBe(500);
    expect(calculateNotionalValue(250, 1)).toBe(250);
    expect(calculateNotionalValue(0, 10)).toBe(0);
  });
});

describe("calculateEstimatedUnits", () => {
  it("divides notional value by entry price", () => {
    expect(calculateEstimatedUnits(500, 100)).toBe(5);
    expect(calculateEstimatedUnits(30000, 60000)).toBe(0.5);
  });

  it("returns 0 instead of Infinity/NaN when price is not positive", () => {
    expect(calculateEstimatedUnits(500, 0)).toBe(0);
    expect(calculateEstimatedUnits(500, -1)).toBe(0);
  });
});

describe("calculateEstimatedFee", () => {
  it("applies the default taker fee rate", () => {
    expect(calculateEstimatedFee(1000)).toBeCloseTo(1000 * TAKER_FEE_RATE, 10);
  });

  it("accepts a custom fee rate", () => {
    expect(calculateEstimatedFee(1000, 0.001)).toBeCloseTo(1, 10);
  });

  it("is 0 for a 0 notional value", () => {
    expect(calculateEstimatedFee(0)).toBe(0);
  });
});

describe("calculateLiquidationPrice", () => {
  it("for a long: liquidation price is below entry price", () => {
    const liq = calculateLiquidationPrice({ side: "long", entryPrice: 60000, leverage: 5, maxLeverage: 50 });
    expect(liq).not.toBeNull();
    expect(liq!).toBeLessThan(60000);
  });

  it("for a short: liquidation price is above entry price", () => {
    const liq = calculateLiquidationPrice({ side: "short", entryPrice: 60000, leverage: 5, maxLeverage: 50 });
    expect(liq).not.toBeNull();
    expect(liq!).toBeGreaterThan(60000);
  });

  it("higher leverage moves the long liquidation price closer to entry (less room)", () => {
    const low = calculateLiquidationPrice({ side: "long", entryPrice: 60000, leverage: 2, maxLeverage: 50 })!;
    const high = calculateLiquidationPrice({ side: "long", entryPrice: 60000, leverage: 20, maxLeverage: 50 })!;
    expect(high).toBeGreaterThan(low); // closer to (i.e. above) the low-leverage liquidation price
  });

  it("higher leverage moves the short liquidation price closer to entry (less room)", () => {
    const low = calculateLiquidationPrice({ side: "short", entryPrice: 60000, leverage: 2, maxLeverage: 50 })!;
    const high = calculateLiquidationPrice({ side: "short", entryPrice: 60000, leverage: 20, maxLeverage: 50 })!;
    expect(high).toBeLessThan(low); // closer to (i.e. below) the low-leverage liquidation price
  });

  it("never returns a negative long liquidation price, even at extreme leverage", () => {
    const liq = calculateLiquidationPrice({ side: "long", entryPrice: 100, leverage: 1000, maxLeverage: 1000 });
    expect(liq).not.toBeNull();
    expect(liq!).toBeGreaterThanOrEqual(0);
  });

  it("returns null for non-positive entry price, leverage, or maxLeverage", () => {
    expect(calculateLiquidationPrice({ side: "long", entryPrice: 0, leverage: 5, maxLeverage: 50 })).toBeNull();
    expect(calculateLiquidationPrice({ side: "long", entryPrice: 100, leverage: 0, maxLeverage: 50 })).toBeNull();
    expect(calculateLiquidationPrice({ side: "long", entryPrice: 100, leverage: 5, maxLeverage: 0 })).toBeNull();
  });
});

describe("maintenanceMarginRateFor", () => {
  it("is half the initial margin rate implied by maxLeverage", () => {
    expect(maintenanceMarginRateFor(50)).toBeCloseTo(1 / 100, 10);
    expect(maintenanceMarginRateFor(10)).toBeCloseTo(1 / 20, 10);
  });

  it("is 0 for a non-positive maxLeverage", () => {
    expect(maintenanceMarginRateFor(0)).toBe(0);
    expect(maintenanceMarginRateFor(-5)).toBe(0);
  });
});

describe("validatePerpOrderInput", () => {
  it("is valid (returns null) for reasonable inputs", () => {
    expect(validatePerpOrderInput(BASE)).toBeNull();
  });

  it("rejects a zero or negative margin amount", () => {
    expect(validatePerpOrderInput({ ...BASE, marginUsdc: 0 })).toBe("invalid-amount");
    expect(validatePerpOrderInput({ ...BASE, marginUsdc: -10 })).toBe("invalid-amount");
    expect(validatePerpOrderInput({ ...BASE, marginUsdc: NaN })).toBe("invalid-amount");
  });

  it("rejects leverage below 1x", () => {
    expect(validatePerpOrderInput({ ...BASE, leverage: 0 })).toBe("invalid-leverage");
    expect(validatePerpOrderInput({ ...BASE, leverage: 0.5 })).toBe("invalid-leverage");
    expect(validatePerpOrderInput({ ...BASE, leverage: -3 })).toBe("invalid-leverage");
  });

  it("rejects leverage above the market's max leverage", () => {
    expect(validatePerpOrderInput({ ...BASE, leverage: 51, maxLeverage: 50 })).toBe("leverage-exceeds-max");
  });

  it("allows leverage exactly at the market's max leverage", () => {
    expect(validatePerpOrderInput({ ...BASE, leverage: 50, maxLeverage: 50 })).toBeNull();
  });

  it("rejects a margin amount greater than the available Hyperliquid balance", () => {
    expect(validatePerpOrderInput({ ...BASE, marginUsdc: 1001, availableBalance: 1000 })).toBe(
      "insufficient-balance"
    );
  });

  it("allows a margin amount exactly equal to the available balance", () => {
    expect(validatePerpOrderInput({ ...BASE, marginUsdc: 1000, availableBalance: 1000 })).toBeNull();
  });

  it("rejects a null, zero, or non-finite entry price", () => {
    expect(validatePerpOrderInput({ ...BASE, entryPrice: null })).toBe("price-unavailable");
    expect(validatePerpOrderInput({ ...BASE, entryPrice: 0 })).toBe("price-unavailable");
    expect(validatePerpOrderInput({ ...BASE, entryPrice: NaN })).toBe("price-unavailable");
  });

  it("checks price availability before amount/leverage (price-unavailable takes precedence)", () => {
    expect(validatePerpOrderInput({ ...BASE, entryPrice: null, marginUsdc: -5, leverage: 0 })).toBe(
      "price-unavailable"
    );
  });
});

describe("buildPerpOrderPreview", () => {
  it("returns a full preview for valid input", () => {
    const result = buildPerpOrderPreview(BASE);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.preview.notionalValue).toBe(500);
    expect(result.preview.estimatedUnits).toBeCloseTo(500 / 60000, 10);
    expect(result.preview.estimatedFee).toBeCloseTo(500 * TAKER_FEE_RATE, 10);
    expect(result.preview.liquidationPrice).not.toBeNull();
    expect(result.preview.liquidationPrice!).toBeLessThan(60000);
    expect(result.preview.side).toBe("long");
  });

  it("returns status invalid with the specific error, and computes nothing, for insufficient balance", () => {
    const result = buildPerpOrderPreview({ ...BASE, marginUsdc: 5000, availableBalance: 1000 });
    expect(result).toEqual({ status: "invalid", error: "insufficient-balance" });
  });

  it("returns status invalid for leverage exceeding the market max", () => {
    const result = buildPerpOrderPreview({ ...BASE, leverage: 100, maxLeverage: 50 });
    expect(result).toEqual({ status: "invalid", error: "leverage-exceeds-max" });
  });

  it("returns status invalid for an unavailable price", () => {
    const result = buildPerpOrderPreview({ ...BASE, entryPrice: null });
    expect(result).toEqual({ status: "invalid", error: "price-unavailable" });
  });

  it("produces a higher liquidation price for a short than a long at the same inputs", () => {
    const long = buildPerpOrderPreview({ ...BASE, side: "long" });
    const short = buildPerpOrderPreview({ ...BASE, side: "short" });
    if (long.status !== "ok" || short.status !== "ok") throw new Error("expected both previews to be ok");
    expect(short.preview.liquidationPrice!).toBeGreaterThan(long.preview.liquidationPrice!);
  });
});
