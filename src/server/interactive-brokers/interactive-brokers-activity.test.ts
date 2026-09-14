import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildInteractiveBrokersTransactionExternalId, isInteractiveBrokersTradeType } from "./interactive-brokers-activity";

describe("buildInteractiveBrokersTransactionExternalId", () => {
  it("is deterministic for identical inputs", () => {
    const row = { conid: 1, occurredAt: "2026-01-01T00:00:00.000Z", quantity: 5, price: 100, amount: 500 };
    expect(buildInteractiveBrokersTransactionExternalId(row)).toBe(buildInteractiveBrokersTransactionExternalId(row));
  });

  it("differs when any one of the five stable fields differs", () => {
    const base = { conid: 1, occurredAt: "2026-01-01T00:00:00.000Z", quantity: 5, price: 100, amount: 500 };
    const id0 = buildInteractiveBrokersTransactionExternalId(base);
    expect(buildInteractiveBrokersTransactionExternalId({ ...base, conid: 2 })).not.toBe(id0);
    expect(buildInteractiveBrokersTransactionExternalId({ ...base, occurredAt: "2026-01-02T00:00:00.000Z" })).not.toBe(id0);
    expect(buildInteractiveBrokersTransactionExternalId({ ...base, quantity: 6 })).not.toBe(id0);
    expect(buildInteractiveBrokersTransactionExternalId({ ...base, price: 101 })).not.toBe(id0);
    expect(buildInteractiveBrokersTransactionExternalId({ ...base, amount: 501 })).not.toBe(id0);
  });

  it("never uses a timestamp alone — combines it with conid/quantity/price/amount", () => {
    const id = buildInteractiveBrokersTransactionExternalId({
      conid: 265598,
      occurredAt: "2023-12-11T05:00:00.000Z",
      quantity: -5,
      price: 192.26,
      amount: 961.3,
    });
    expect(id).toContain("265598");
    expect(id).toContain("-5");
    expect(id).toContain("192.26");
    expect(id).toContain("961.3");
  });

  it("handles a null price without throwing or colliding with a real price of the string 'null'", () => {
    const withNullPrice = buildInteractiveBrokersTransactionExternalId({
      conid: 1,
      occurredAt: "2026-01-01T00:00:00.000Z",
      quantity: 1,
      price: null,
      amount: 10,
    });
    expect(withNullPrice).toContain("null");
  });
});

describe("isInteractiveBrokersTradeType", () => {
  it("recognizes Buy/Sell case-insensitively", () => {
    expect(isInteractiveBrokersTradeType("Buy")).toBe(true);
    expect(isInteractiveBrokersTradeType("SELL")).toBe(true);
    expect(isInteractiveBrokersTradeType("sell")).toBe(true);
  });

  it("rejects anything else, including undocumented types", () => {
    expect(isInteractiveBrokersTradeType("Dividend")).toBe(false);
    expect(isInteractiveBrokersTradeType("Transfer")).toBe(false);
    expect(isInteractiveBrokersTradeType("")).toBe(false);
  });
});
