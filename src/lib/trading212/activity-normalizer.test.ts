import { describe, expect, it } from "vitest";
import {
  normalizeOrderRow,
  normalizeDividendRow,
  normalizeTransactionRow,
  type OrderRowInput,
  type DividendRowInput,
  type TransactionRowInput,
} from "./activity-normalizer";

function order(overrides: Partial<OrderRowInput> = {}): OrderRowInput {
  return {
    externalId: "order-1",
    compassAssetId: "nvda",
    externalTicker: "NVDA_US_EQ",
    externalName: "NVIDIA Corp.",
    side: "BUY",
    status: "FILLED",
    quantity: 10,
    filledQuantity: 10,
    fillPrice: 180.2,
    filledValue: 1802,
    currencyCode: "USD",
    occurredAt: "2026-09-06T10:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeOrderRow — fully filled", () => {
  it("emits only an execution item, never a redundant order item, for a fully filled order", () => {
    const items = normalizeOrderRow(order());

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("execution");
    expect(items[0].quantity).toBe(10);
    expect(items[0].price).toBe(180.2);
    expect(items[0].grossAmount).toBe(1802);
    expect(items[0].direction).toBe("BUY");
    expect(items[0].orderId).toBe("order-1");
    expect(items[0].externalId).toBe("order-1");
  });

  it("uses the real reported filledValue for grossAmount rather than recomputing it", () => {
    const items = normalizeOrderRow(order({ fillPrice: 180.2, filledValue: 1800 })); // deliberately inconsistent with fillPrice*qty
    expect(items[0].grossAmount).toBe(1800);
  });

  it("derives grossAmount from fillPrice × filledQuantity only when no real aggregate exists", () => {
    const items = normalizeOrderRow(order({ filledValue: null, fillPrice: 180.2, filledQuantity: 5, quantity: 5 }));
    expect(items).toHaveLength(1);
    expect(items[0].grossAmount).toBeCloseTo(901.0);
  });

  it("resolves the mapped CompassFinance asset's real name", () => {
    const items = normalizeOrderRow(order());
    expect(items[0].assetName).toBe("NVIDIA Corp.");
  });
});

describe("normalizeOrderRow — SELL", () => {
  it("normalizes direction correctly for a sell", () => {
    const items = normalizeOrderRow(order({ side: "SELL" }));
    expect(items[0].direction).toBe("SELL");
  });
});

describe("normalizeOrderRow — partial fill", () => {
  it("emits BOTH an order item (requested qty + status) and an execution item (actual filled qty) — never claims the requested quantity was executed", () => {
    const items = normalizeOrderRow(
      order({ status: "PARTIALLY_FILLED", quantity: 10, filledQuantity: 6, fillPrice: 180, filledValue: 1080 })
    );

    expect(items).toHaveLength(2);
    const orderItem = items.find((i) => i.kind === "order")!;
    const executionItem = items.find((i) => i.kind === "execution")!;

    expect(orderItem.quantity).toBe(10); // requested
    expect(orderItem.status).toBe("PARTIALLY_FILLED");
    expect(orderItem.grossAmount).toBeNull(); // an order-lifecycle item never carries an execution amount

    expect(executionItem.quantity).toBe(6); // actually filled — never 10
    expect(executionItem.grossAmount).toBe(1080);
  });

  it("shows both views when filled > 0 but the requested quantity is unknown (can't confirm full fill)", () => {
    const items = normalizeOrderRow(order({ quantity: null, filledQuantity: 4 }));
    expect(items.map((i) => i.kind).sort()).toEqual(["execution", "order"]);
  });
});

describe("normalizeOrderRow — unfilled (cancelled/rejected)", () => {
  it("emits only an order item — never fabricates an execution for a 0-fill order", () => {
    const items = normalizeOrderRow(order({ status: "CANCELLED", filledQuantity: 0, fillPrice: null, filledValue: null }));

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("order");
    expect(items[0].status).toBe("CANCELLED");
  });

  it("treats a null filledQuantity the same as zero — no execution", () => {
    const items = normalizeOrderRow(order({ status: "REJECTED", filledQuantity: null, fillPrice: null, filledValue: null }));
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("order");
  });
});

describe("normalizeOrderRow — unmapped instrument", () => {
  it("falls back to the raw external name, then raw ticker, never a guessed CompassFinance name", () => {
    const withName = normalizeOrderRow(order({ compassAssetId: null, externalTicker: "VWCE_EQ", externalName: "Vanguard All-World ETF" }));
    expect(withName[0].assetName).toBe("Vanguard All-World ETF");
    expect(withName[0].compassAssetId).toBeNull();
    expect(withName[0].rawTicker).toBe("VWCE_EQ");

    const withoutName = normalizeOrderRow(order({ compassAssetId: null, externalTicker: "VWCE_EQ", externalName: null }));
    expect(withoutName[0].assetName).toBe("VWCE_EQ");
  });
});

describe("normalizeOrderRow — missing optional fields", () => {
  it("never fabricates a price when none is reported", () => {
    const items = normalizeOrderRow(order({ fillPrice: null, filledValue: null, filledQuantity: 5 }));
    expect(items[0].price).toBeNull();
    expect(items[0].grossAmount).toBeNull();
  });

  it("always carries the real underlying order id for traceability, on both derived views", () => {
    const items = normalizeOrderRow(order({ status: "PARTIALLY_FILLED", quantity: 10, filledQuantity: 5 }));
    expect(items.every((i) => i.orderId === "order-1")).toBe(true);
    expect(items.every((i) => i.externalId === "order-1")).toBe(true);
    // but each derived view still needs its OWN unique key for React/UI lists
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });
});

describe("normalizeDividendRow", () => {
  function dividend(overrides: Partial<DividendRowInput> = {}): DividendRowInput {
    return {
      externalId: "div-1",
      compassAssetId: "nvda",
      externalTicker: "NVDA_US_EQ",
      externalName: "NVIDIA Corp.",
      quantity: 12,
      amount: 12.4,
      currencyCode: "USD",
      occurredAt: "2026-09-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("normalizes a dividend as a real, positive inbound amount with the mapped asset name", () => {
    const item = normalizeDividendRow(dividend());
    expect(item.kind).toBe("dividend");
    expect(item.assetName).toBe("NVIDIA Corp.");
    expect(item.grossAmount).toBe(12.4);
    expect(item.direction).toBe("IN");
    expect(item.currency).toBe("USD");
    expect(item.externalId).toBe("div-1");
  });

  it("never fabricates a separate net amount when Trading 212 gave only one figure", () => {
    expect(normalizeDividendRow(dividend()).netAmount).toBeNull();
  });

  it("shows an unmapped instrument's raw ticker/name rather than guessing", () => {
    const item = normalizeDividendRow(dividend({ compassAssetId: null, externalTicker: "SAP_DE_EQ", externalName: "SAP SE" }));
    expect(item.compassAssetId).toBeNull();
    expect(item.assetName).toBe("SAP SE");
    expect(item.rawTicker).toBe("SAP_DE_EQ");
  });
});

describe("normalizeTransactionRow", () => {
  function transaction(overrides: Partial<TransactionRowInput> = {}): TransactionRowInput {
    return {
      externalId: "tx-1",
      type: "DEPOSIT",
      amount: 500,
      currencyCode: "USD",
      occurredAt: "2026-07-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("normalizes a deposit as an inbound account-level event with no asset", () => {
    const item = normalizeTransactionRow(transaction());
    expect(item.kind).toBe("deposit");
    expect(item.direction).toBe("IN");
    expect(item.compassAssetId).toBeNull();
    expect(item.assetName).toBeNull();
    expect(item.grossAmount).toBe(500);
  });

  it("normalizes a withdrawal as outbound", () => {
    const item = normalizeTransactionRow(transaction({ type: "WITHDRAW", amount: -200 }));
    expect(item.kind).toBe("withdrawal");
    expect(item.direction).toBe("OUT");
    expect(item.grossAmount).toBe(-200);
  });

  it("normalizes a fee, exposing the real fee amount as a positive magnitude", () => {
    const item = normalizeTransactionRow(transaction({ type: "FEE", amount: -1.5 }));
    expect(item.kind).toBe("fee");
    expect(item.fees).toBe(1.5);
  });

  it("never populates fees for a non-fee transaction", () => {
    expect(normalizeTransactionRow(transaction({ type: "DEPOSIT" })).fees).toBeNull();
  });

  it("preserves the raw provider type for a transaction type with no dedicated bucket, rather than guessing a category", () => {
    const item = normalizeTransactionRow(transaction({ type: "TRANSFER" }));
    expect(item.kind).toBe("transfer");
    expect(item.rawType).toBe("TRANSFER");
  });

  it("clears rawType when the kind already exactly matches the provider's own category", () => {
    expect(normalizeTransactionRow(transaction({ type: "DEPOSIT" })).rawType).toBeNull();
  });
});
