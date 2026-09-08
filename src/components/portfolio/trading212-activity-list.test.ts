import { describe, expect, it } from "vitest";
import { describeItem } from "./trading212-activity-list";
import type { NormalizedActivityItem } from "@/lib/trading212/activity-normalizer";

const t = (key: string) => {
  const labels: Record<string, string> = {
    "trading212.orderLabel": "Order",
    "trading212.requestedLabel": "Requested",
    "trading212.sharesLabel": "shares",
    "trading212.dividendLabel": "Dividend",
    "trading212.depositLabel": "Deposit",
    "trading212.withdrawLabel": "Withdrawal",
    "trading212.feeLabel": "Fee",
    "trading212.transferLabel": "Transfer",
  };
  return labels[key] ?? key;
};

function baseItem(overrides: Partial<NormalizedActivityItem>): NormalizedActivityItem {
  return {
    provider: "trading212",
    kind: "execution",
    id: "1",
    compassAssetId: "nvda",
    assetName: "NVIDIA Corp.",
    rawTicker: "NVDA_US_EQ",
    occurredAt: "2026-09-06T10:00:00.000Z",
    quantity: null,
    price: null,
    grossAmount: null,
    netAmount: null,
    fees: null,
    currency: "USD",
    orderId: null,
    externalId: "ext-1",
    status: null,
    direction: null,
    rawType: null,
    ...overrides,
  };
}

describe("describeItem — execution", () => {
  it("matches the worked example format: DIRECTION NAME / qty shares × price / gross amount", () => {
    const item = baseItem({ kind: "execution", direction: "BUY", quantity: 5, price: 180.2, grossAmount: 901.0 });

    const result = describeItem(item, t);

    expect(result.title).toBe("BUY NVIDIA Corp.");
    expect(result.subtitle).toBe("5 shares × $180.20 USD");
    expect(result.amount).toBe("$901.00 USD");
  });

  it("shows no amount when grossAmount is unavailable, never fabricating one", () => {
    const item = baseItem({ kind: "execution", direction: "SELL", quantity: 3, price: null, grossAmount: null });
    expect(describeItem(item, t).amount).toBeNull();
  });
});

describe("describeItem — order", () => {
  it("shows the ORDER label, requested quantity, and real status distinctly from an execution", () => {
    const item = baseItem({ kind: "order", direction: "BUY", quantity: 10, status: "PARTIALLY_FILLED", grossAmount: null });

    const result = describeItem(item, t);

    expect(result.title).toBe("Order · BUY NVIDIA Corp.");
    expect(result.subtitle).toBe("Requested: 10 · PARTIALLY_FILLED");
    expect(result.amount).toBeNull(); // an order-lifecycle item never carries an execution amount
  });

  it("shows a cancelled/rejected order's status without any fabricated quantity", () => {
    const item = baseItem({ kind: "order", direction: "BUY", quantity: null, status: "REJECTED" });
    expect(describeItem(item, t).subtitle).toBe("REJECTED");
  });
});

describe("describeItem — dividend", () => {
  it("shows a positive, currency-labeled amount", () => {
    const item = baseItem({ kind: "dividend", quantity: 12, grossAmount: 12.4, currency: "USD" });

    const result = describeItem(item, t);

    expect(result.title).toBe("Dividend · NVIDIA Corp.");
    expect(result.amount).toBe("+$12.40 USD");
  });
});

describe("describeItem — deposit/withdrawal/fee/transfer", () => {
  it("labels a deposit distinctly and shows it as a positive inbound amount", () => {
    const item = baseItem({ kind: "deposit", direction: "IN", grossAmount: 500, compassAssetId: null, assetName: null, rawTicker: null });
    const result = describeItem(item, t);
    expect(result.title).toBe("Deposit");
    expect(result.amount).toBe("+$500.00 USD");
  });

  it("labels a withdrawal distinctly without a plus sign", () => {
    const item = baseItem({ kind: "withdrawal", direction: "OUT", grossAmount: -200, compassAssetId: null, assetName: null, rawTicker: null });
    const result = describeItem(item, t);
    expect(result.title).toBe("Withdrawal");
    expect(result.amount).toBe("-$200.00 USD");
  });

  it("labels a fee distinctly", () => {
    const item = baseItem({ kind: "fee", grossAmount: -1.5, fees: 1.5, compassAssetId: null, assetName: null, rawTicker: null });
    expect(describeItem(item, t).title).toBe("Fee");
  });

  it("preserves the real provider type for an unbucketed transfer in the subtitle", () => {
    const item = baseItem({ kind: "transfer", rawType: "TRANSFER", grossAmount: 100, compassAssetId: null, assetName: null, rawTicker: null });
    const result = describeItem(item, t);
    expect(result.title).toBe("Transfer");
    expect(result.subtitle).toBe("TRANSFER");
  });
});
